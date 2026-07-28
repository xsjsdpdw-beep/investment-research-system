import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { displayHkName } from "./hk-names.mjs";

const PYTHON = process.env.IPO_XRAY_PYTHON
  || "/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const PARSER = fileURLToPath(new URL("./hkex-report-parser.py", import.meta.url));
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 IPO-XRAY/0.4";
const HISTORY_START = "2024-01-01";
const HK_MARKET_SOURCE = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get";
const INDEX_SOURCE = "https://push2his.eastmoney.com/api/qt/stock/kline/get";

function formatDate(value) {
  return value ? String(value).slice(0, 10) : null;
}

function projectDate(project) {
  return formatDate(project.date || project.issue?.listingDate);
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function statusMeta(stage = "") {
  let key = "accepted";
  let tone = "blue";
  if (/终止|不予注册/.test(stage)) [key, tone] = ["terminated", "red"];
  else if (/中止/.test(stage)) [key, tone] = ["suspended", "gray"];
  else if (/上市/.test(stage)) [key, tone] = ["listed", "green"];
  else if (/发行|配发/.test(stage)) [key, tone] = ["offering", "orange"];
  else if (/注册/.test(stage)) [key, tone] = ["registration", "amber"];
  else if (/上市委|聆讯/.test(stage)) [key, tone] = ["hearing", "purple"];
  else if (/问询/.test(stage)) [key, tone] = ["inquiry", "cyan"];
  return { key, tone, stageKey: key, stageTone: tone };
}

function qualityScore(row) {
  const dimensions = [];
  const issuePe = number(row.AFTER_ISSUE_PE);
  const industryPe = number(row.INDUSTRY_PE_NEW || row.INDUSTRY_PE);
  if (issuePe && industryPe) {
    const ratio = issuePe / industryPe;
    dimensions.push({ label: "定价估值", weight: 30, value: ratio <= 0.8 ? 92 : ratio <= 1 ? 82 : ratio <= 1.3 ? 68 : ratio <= 2 ? 48 : 30 });
  }
  const firstDay = number(row.LD_CLOSE_CHANGE);
  if (firstDay !== null) {
    dimensions.push({ label: "首日定价效率", weight: 20, value: firstDay < -10 ? 35 : firstDay <= 30 ? 90 : firstDay <= 80 ? 75 : firstDay <= 150 ? 58 : 42 });
  }
  const hitRate = number(row.ONLINE_ISSUE_LWR);
  if (hitRate !== null) {
    dimensions.push({ label: "发行需求", weight: 15, value: hitRate <= 0.05 ? 90 : hitRate <= 0.2 ? 78 : hitRate <= 0.5 ? 65 : 52 });
  }
  if (number(row.TOTAL_RAISE_FUNDS) || number(row.NETSUMFINA)) {
    dimensions.push({ label: "发行完整度", weight: 15, value: 82 });
  }
  const availableWeight = dimensions.reduce((sum, item) => sum + item.weight, 0);
  const weighted = dimensions.reduce((sum, item) => sum + item.value * item.weight, 0);
  return {
    score: availableWeight >= 35 ? Math.round(weighted / availableWeight) : null,
    confidence: availableWeight,
    dimensions,
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "User-Agent": USER_AGENT,
      Referer: "https://data.eastmoney.com/xg/xg/",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

export async function fetchAListingHistory(startDate = HISTORY_START) {
  const first = new URL("https://datacenter-web.eastmoney.com/api/data/v1/get");
  const base = {
    reportName: "RPTA_APP_IPOAPPLY",
    columns: "ALL",
    pageNumber: "1",
    pageSize: "500",
    sortColumns: "LISTING_DATE",
    sortTypes: "-1",
    source: "WEB",
    client: "WEB",
    filter: `(LISTING_DATE>='${startDate}')`,
  };
  Object.entries(base).forEach(([key, value]) => first.searchParams.set(key, value));
  const firstPayload = await fetchJson(first);
  const pages = firstPayload.result?.pages || 1;
  const payloads = [firstPayload];
  for (let page = 2; page <= pages; page += 1) {
    const url = new URL(first);
    url.searchParams.set("pageNumber", String(page));
    payloads.push(await fetchJson(url));
  }
  const rows = payloads.flatMap((payload) => payload.result?.data || [])
    .filter((row) => /上海证券交易所|深圳证券交易所/.test(row.TRADE_MARKET || ""));
  const projects = rows.map((row) => {
    const code = row.SECURITY_CODE;
    const listingDate = formatDate(row.LISTING_DATE);
    const board = row.MARKET_TYPE_NEW || row.MARKET_TYPE || row.TRADE_MARKET;
    const score = qualityScore(row);
    const totalIssueShares = number(row.TOTAL_ISSUE_NUM || row.ISSUE_NUM);
    const onlineShares = number(row.ONLINE_ISSUE_NUM);
    const offlineShares = number(row.OFFLINE_PLACING_NUM);
    const afterIssueShares = number(row.TOTAL_SHARES);
    const onlineRatio = onlineShares && totalIssueShares ? Math.min(100, Math.round((onlineShares / 10000 / totalIssueShares) * 1000) / 10) : null;
    const offlineRatio = offlineShares && totalIssueShares ? Math.min(100, Math.round((offlineShares / 10000 / totalIssueShares) * 1000) / 10) : null;
    const dilutionRatio = totalIssueShares && afterIssueShares ? Math.round((totalIssueShares * 10000 / afterIssueShares) * 1000) / 10 : null;
    return {
      id: `A-LIST-${code}`,
      market: "A",
      recordType: "listing",
      board,
      code,
      name: row.SECURITY_NAME_ABBR || row.SECURITY_NAME || row.SECURITY_NAME_FULL || "未命名项目",
      sector: row.INDUSTRY_NAME || row.MAIN_BUSINESS || "行业待核验",
      stage: listingDate > new Date().toISOString().slice(0, 10) ? "待上市" : "已上市",
      ...statusMeta(listingDate > new Date().toISOString().slice(0, 10) ? "发行" : "已上市"),
      event: listingDate ? `上市 ${listingDate}` : "上市日期待核验",
      date: listingDate || formatDate(row.APPLY_DATE),
      updated: listingDate || formatDate(row.APPLY_DATE) || "待接入",
      dataQuality: "全市场发行清单 + 交易所交叉核验",
      tags: ["A股", board, "发行上市"],
      thesis: "发行质量要同时看定价相对行业、网上获配难度、募资规模与上市首日的价格发现效率。",
      stagePath: [
        { label: "申购", state: "done" },
        { label: "定价", state: "done" },
        { label: "上市", state: listingDate > new Date().toISOString().slice(0, 10) ? "active" : "done" },
        { label: "上市后", state: listingDate > new Date().toISOString().slice(0, 10) ? "pending" : "active" },
      ],
      issue: {
        issuePrice: number(row.ISSUE_PRICE),
        issuePe: number(row.AFTER_ISSUE_PE),
        industryPe: number(row.INDUSTRY_PE_NEW || row.INDUSTRY_PE),
        issueSharesWan: number(row.TOTAL_ISSUE_NUM || row.ISSUE_NUM),
        issueShares: totalIssueShares === null ? null : totalIssueShares * 10000,
        grossProceedsYi: number(row.TOTAL_RAISE_FUNDS),
        netProceedsYi: number(row.NETSUMFINA),
        issueExpensesYi: number(row.TOTAL_RAISE_FUNDS) !== null && number(row.NETSUMFINA) !== null ? Math.max(0, number(row.TOTAL_RAISE_FUNDS) - number(row.NETSUMFINA)) : null,
        issueMethod: row.ISSUE_WAY_EXPLAIN || row.ISSUE_WAY,
        sponsor: row.RECOMMEND_ORG,
        underwriter: row.UNDERWRITER_ORG,
        onlineApplyUpper: number(row.ONLINE_APPLY_UPPER),
        totalApplyNum: number(row.TOTAL_APPLY_NUM),
        onlineMultiple: number(row.ONLINE_ES_MULTIPLE),
        offlineMultiple: number(row.OFFLINE_VAS_MULTIPLE),
        offlineObjects: number(row.OFFLINE_EP_OBJECT),
        offlinePlacingRatio: number(row.OFFLINE_VAP_RATIO),
      },
      ownership: [
        { label: "网上发行", value: onlineRatio, note: "按发行清单股数计算" },
        { label: "网下发行", value: offlineRatio, note: offlineRatio === null ? "待发行公告细分" : "按网下配售股数计算" },
        { label: "战略配售", value: null, note: "待发行结果公告拆分" },
        { label: "发行新股 / 发行后股本", value: dilutionRatio, note: dilutionRatio === null ? "待招股书股本章节" : "按发行清单股本字段计算" },
      ],
      proceeds: [
        { label: "募集资金总额", value: null, amount: number(row.TOTAL_RAISE_FUNDS), unit: "亿元", note: number(row.TOTAL_RAISE_FUNDS) ? "发行清单原值" : "待接入" },
        { label: "募集资金净额", value: null, amount: number(row.NETSUMFINA), unit: "亿元", note: number(row.NETSUMFINA) ? "发行清单原值" : "待接入" },
        { label: "发行费用", value: null, amount: number(row.TOTAL_RAISE_FUNDS) !== null && number(row.NETSUMFINA) !== null ? Math.max(0, number(row.TOTAL_RAISE_FUNDS) - number(row.NETSUMFINA)) : null, unit: "亿元", note: "总额 - 净额，未替代招股书披露" },
        { label: "具体募投项目", value: null, note: "待招股书项目表解析" },
      ],
      financials: {
        profitable: row.IS_PROFIT === "1" || row.IS_PROFIT === 1 ? true : row.IS_PROFIT === "0" || row.IS_PROFIT === 0 ? false : null,
        bvps: number(row.BVPS),
        mainBusiness: row.MAIN_BUSINESS || null,
        periods: [],
        metrics: {},
        profitQuality: [{ label: "财务三年表", value: "待招股书解析", note: "发行清单不含完整财务报表" }],
      },
      business: {
        mainBusiness: row.MAIN_BUSINESS || null,
        sector: row.INDUSTRY_NAME || null,
        customerConcentration: null,
      },
      performance: {
        firstDayOpen: number(row.LD_OPEN_PREMIUM),
        firstDayClose: number(row.LD_CLOSE_CHANGE),
        firstDayHigh: number(row.LD_HIGH_CHANG),
        turnover: number(row.TURNOVERRATE),
        ipoYield: number(row.IPO_YIELD),
        averagePrice: number(row.LD_AVERAGE_PRICE),
      },
      score,
      flags: [
        score.score === null ? "评分字段不足" : `发行质量 ${score.score} 分`,
        score.confidence < 70 ? `评分置信度 ${score.confidence}%` : "评分字段较完整",
      ],
      sources: ["a-ipo-history"],
      documentLinks: row.INFO_CODE ? [{
        label: "发行结果与公告索引",
        kind: "公开发行资料",
        url: `https://data.eastmoney.com/notices/stock/${code}.html`,
      }] : [],
      raw: row,
    };
  });
  return { projects, total: projects.length, startDate };
}

function parseHkexReports(filePaths) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [PARSER, ...filePaths], { stdio: ["ignore", "pipe", "pipe"] });
    const output = [];
    const errors = [];
    child.stdout.on("data", (chunk) => output.push(chunk));
    child.stderr.on("data", (chunk) => errors.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(JSON.parse(Buffer.concat(output).toString("utf8")));
      else reject(new Error(Buffer.concat(errors).toString("utf8").trim() || `python exit ${code}`));
    });
  });
}

export async function fetchHkexListingHistory(startYear = 2024) {
  const currentYear = new Date().getFullYear();
  const directory = await mkdtemp(join(tmpdir(), "ipo-xray-hkex-"));
  try {
    const englishFiles = [];
    const chineseFiles = [];
    for (let year = startYear; year <= currentYear; year += 1) {
      for (const [language, files] of [["Eng", englishFiles], ["Chi", chineseFiles]]) {
        const url = `https://www2.hkexnews.hk/-/media/HKEXnews/Homepage/New-Listings/New-Listing-Information/New-Listing-Report/Main/NLR${year}_${language}.xlsx`;
        const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Referer: "https://www2.hkexnews.hk/" } });
        if (!response.ok) throw new Error(`HKEX ${year} ${language}: ${response.status}`);
        const file = join(directory, `NLR${year}_${language}.xlsx`);
        await writeFile(file, Buffer.from(await response.arrayBuffer()));
        files.push(file);
      }
    }
    const [englishRows, chineseRows] = await Promise.all([
      parseHkexReports(englishFiles),
      parseHkexReports(chineseFiles),
    ]);
    const chineseByKey = new Map();
    const chineseByCode = new Map();
    for (const row of chineseRows) {
      chineseByKey.set(`${row.code}-${row.listingDate}`, row.name);
      chineseByCode.set(row.code, row.name);
    }
    const rows = englishRows.map((row) => ({
      ...row,
      englishName: row.name,
      chineseName: chineseByKey.get(`${row.code}-${row.listingDate}`) || chineseByCode.get(row.code) || null,
    }));
    const projects = rows.map((row) => {
      const displayName = displayHkName(row.code, row.chineseName || row.name);
      return {
        id: `HK-LIST-${row.code}-${row.listingDate}`,
        market: "HK",
        recordType: "listing",
        board: "Main Board",
        code: row.code,
        name: displayName,
        sector: "港交所主板新上市",
        stage: "已上市",
        ...statusMeta("已上市"),
        event: `上市 ${row.listingDate}`,
        date: row.listingDate,
        updated: row.listingDate,
        dataQuality: row.chineseName ? "港交所年度 New Listing Report（中文显示名）" : "港交所年度 New Listing Report（中文显示名待核验）",
        tags: ["港股", "主板", "已上市"],
        thesis: "港股发行质量先看发售价与募资规模，再回到招股书核验基石、国际配售、股权稀释与募资用途。",
        stagePath: [
          { label: "递表 / 聆讯", state: "done" },
          { label: "招股书", state: "done" },
          { label: "配发结果", state: "done" },
          { label: "上市后", state: "active" },
        ],
        issue: {
          issuePrice: number(row.issuePrice),
          issueShares: number(row.offerShares),
          grossProceedsHkd: number(row.fundsRaised),
          sponsor: row.sponsor || null,
          accountant: row.accountant || null,
          prospectusDate: row.prospectusDate,
          listingDate: row.listingDate,
        },
        ownership: [
          { label: "全球发售股份", value: null, note: row.offerShares ? `${Number(row.offerShares).toLocaleString("zh-CN")} 股` : "待核验" },
          { label: "公众发售比例", value: null, note: "待招股书 / 配售结果" },
          { label: "上市后稀释", value: null, note: "待招股书股本章节" },
        ],
        proceeds: [
          { label: "发行募资", value: null, amount: row.fundsRaised, unit: "港元", note: row.fundsRaised ? "港交所 New Listing Report 原值" : "待接入" },
          { label: "募资用途", value: null, note: "待招股书逐项解析" },
          { label: "发行费用 / 净募资", value: null, note: "待招股书与配售公告" },
          { label: "营运资金 / 其他", value: null, note: "待招股书解析" },
        ],
        financials: {
          periods: [],
          metrics: {},
          profitQuality: [{ label: "历史财务三年表", value: "待招股书解析", note: "年度新上市清单不含完整财务报表" }],
          mainBusiness: null,
        },
        business: {
          mainBusiness: null,
          customerConcentration: null,
          topFiveCustomers: null,
        },
        performance: {},
        score: { score: null, confidence: 20, dimensions: [] },
        flags: ["港交所年度清单已覆盖", "质量评分待财务与配售字段"],
        sources: ["hkex-history"],
        documentLinks: [{
          label: `${row.listingDate.slice(0, 4)} 年新上市报告（中文）`,
          kind: "港交所 XLSX",
          url: `https://www2.hkexnews.hk/-/media/HKEXnews/Homepage/New-Listings/New-Listing-Information/New-Listing-Report/Main/NLR${row.listingDate.slice(0, 4)}_Chi.xlsx`,
        }, {
          label: `${row.listingDate.slice(0, 4)} 年 New Listing Report（英文）`,
          kind: "港交所 XLSX",
          url: `https://www2.hkexnews.hk/-/media/HKEXnews/Homepage/New-Listings/New-Listing-Information/New-Listing-Report/Main/NLR${row.listingDate.slice(0, 4)}_Eng.xlsx`,
        }],
        raw: { ...row, displayName, name: row.chineseName || row.name },
      };
    });
    return { projects, total: projects.length, startYear };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function datePlusDays(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function fetchHkDaily(code, listingDate) {
  const normalizedCode = String(code).padStart(5, "0");
  const url = new URL(HK_MARKET_SOURCE);
  url.searchParams.set("param", `hk${normalizedCode},day,${listingDate},${datePlusDays(listingDate, 14)},30,qfq`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Referer: "https://gu.qq.com/" },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const payload = await response.json();
    return payload.data?.[`hk${normalizedCode}`]?.day || [];
  } finally {
    clearTimeout(timeout);
  }
}

function performanceFromHkDaily(project, rows) {
  const issuePrice = number(project.issue?.issuePrice);
  const listingDate = formatDate(project.issue?.listingDate || project.date);
  const first = rows.find((row) => row?.[0] >= listingDate);
  if (!first || issuePrice === null || issuePrice === 0) return null;
  const [date, open, close, high, low, volume] = first.map((value, index) => index === 0 ? value : number(value));
  const change = (value) => value === null ? null : Math.round(((value / issuePrice) - 1) * 10000) / 100;
  return {
    firstDayDate: date,
    firstDayOpen: change(open),
    firstDayClose: change(close),
    firstDayHigh: change(high),
    firstDayLow: change(low),
    firstDayVolume: volume,
    source: "腾讯港股日线",
    sourceUrl: `${HK_MARKET_SOURCE}?param=hk${String(project.code).padStart(5, "0")},day,${listingDate},${datePlusDays(listingDate, 14)},30,qfq`,
  };
}

export async function fetchHkListingPerformance(projects, previousCache = {}) {
  const cache = { ...previousCache };
  const targets = projects.filter((project) => project.stageKey === "listed" && project.code && projectDate(project) && number(project.issue?.issuePrice) !== null);
  const pending = targets.filter((project) => {
    const item = cache[String(project.code).padStart(5, "0")];
    return !item || item.listingDate !== projectDate(project) || item.issuePrice !== number(project.issue?.issuePrice);
  });
  let cursor = 0;
  const worker = async () => {
    while (cursor < pending.length) {
      const project = pending[cursor++];
      const code = String(project.code).padStart(5, "0");
      try {
        const rows = await fetchHkDaily(code, projectDate(project));
        const performance = performanceFromHkDaily(project, rows);
        cache[code] = performance
          ? { ...performance, listingDate: projectDate(project), issuePrice: number(project.issue?.issuePrice) }
          : { listingDate: projectDate(project), issuePrice: number(project.issue?.issuePrice), source: "腾讯港股日线", status: "未返回上市日行情" };
      } catch (error) {
        cache[code] = { listingDate: projectDate(project), issuePrice: number(project.issue?.issuePrice), source: "腾讯港股日线", status: "请求失败", error: error.message };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, Math.max(1, pending.length)) }, worker));
  const enrichedProjects = projects.map((project) => {
    const performance = cache[String(project.code).padStart(5, "0")];
    if (performance?.firstDayClose === undefined || performance?.firstDayClose === null) return project;
    return { ...project, performance: { ...(project.performance || {}), ...performance } };
  });
  return { projects: enrichedProjects, cache, fetched: pending.length };
}

function benchmarkForProject(project) {
  if (project.market === "HK") return { secid: "100.HSI", name: "恒生指数" };
  const board = String(project.board || project.raw?.MARKET_TYPE_NEW || project.raw?.MARKET_TYPE || "");
  if (/科创/.test(board)) return { secid: "1.000688", name: "科创50" };
  if (/创业/.test(board)) return { secid: "0.399006", name: "创业板指" };
  if (/深圳|深市/.test(String(project.raw?.TRADE_MARKET || project.raw?.MARKET || ""))) return { secid: "0.399001", name: "深证成指" };
  return { secid: "1.000001", name: "上证指数" };
}

async function fetchIndexKlines(secid, startDate, endDate) {
  const url = new URL(INDEX_SOURCE);
  url.searchParams.set("secid", secid);
  url.searchParams.set("fields1", "f1,f2,f3,f4,f5,f6");
  url.searchParams.set("fields2", "f51,f52,f53,f54,f55,f56,f57,f58");
  url.searchParams.set("klt", "101");
  url.searchParams.set("fqt", "1");
  url.searchParams.set("beg", startDate.replaceAll("-", ""));
  url.searchParams.set("end", endDate.replaceAll("-", ""));
  const payload = await new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/curl", ["-L", "--max-time", "15", "-sS", "-H", `User-Agent: ${USER_AGENT}`, "-H", "Referer: https://quote.eastmoney.com/", url.toString()], { stdio: ["ignore", "pipe", "pipe"] });
    const output = [];
    const errorOutput = [];
    child.stdout.on("data", (chunk) => output.push(chunk));
    child.stderr.on("data", (chunk) => errorOutput.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(Buffer.concat(errorOutput).toString("utf8").trim() || `curl exit ${code}`));
      try { resolve(JSON.parse(Buffer.concat(output).toString("utf8"))); } catch (error) { reject(error); }
    });
  });
  return (payload.data?.klines || []).map((line) => {
      const [date, open, close, high, low, volume, amount, change] = String(line).split(",");
      return { date, open: number(open), close: number(close), high: number(high), low: number(low), change: number(change) };
    });
}

export async function enrichRelativeIndexPerformance(projects) {
  const candidates = projects.filter((project) => project.stageKey === "listed" && projectDate(project) && project.performance?.firstDayClose !== null && project.performance?.firstDayClose !== undefined);
  const groups = new Map();
  const errors = [];
  for (const project of candidates) {
    const benchmark = benchmarkForProject(project);
    const group = groups.get(benchmark.secid) || { benchmark, projects: [] };
    group.projects.push(project);
    groups.set(benchmark.secid, group);
  }
  const benchmarkRows = new Map();
  for (const [secid, group] of groups) {
    const dates = group.projects.map(projectDate).sort();
    try {
      const rows = await fetchIndexKlines(secid, dates[0], datePlusDays(dates.at(-1), 12));
      benchmarkRows.set(secid, rows);
    } catch (error) {
      errors.push(`${group.benchmark.name}：${error.message}`);
    }
  }
  const enriched = projects.map((project) => {
    const performance = project.performance || {};
    if (performance.firstDayClose === null || performance.firstDayClose === undefined) return project;
    const benchmark = benchmarkForProject(project);
    const rows = benchmarkRows.get(benchmark.secid) || [];
    const first = rows.find((row) => row.date >= projectDate(project));
    if (!first || first.change === null) return project;
    const relative = Math.round((performance.firstDayClose - first.change) * 100) / 100;
    return {
      ...project,
      performance: {
        ...performance,
        benchmark: benchmark.name,
        benchmarkChange: first.change,
        relativeIndexChange: relative,
        relativeIndex: `相对${benchmark.name} ${relative >= 0 ? "+" : ""}${relative.toFixed(2)}%`,
        benchmarkSource: INDEX_SOURCE,
      },
    };
  });
  return { projects: enriched, fetched: groups.size - errors.length, errors };
}

export { HISTORY_START, statusMeta };
