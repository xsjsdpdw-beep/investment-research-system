import { extractPdfText } from "./pdf-extractor.mjs";
import { enrichRelativeIndexPerformance, fetchAListingHistory, fetchHkListingPerformance, fetchHkexListingHistory, HISTORY_START, statusMeta } from "./historical.mjs";
import { displayHkName } from "./hk-names.mjs";

const SOURCES = {
  sse: {
    id: "sse-ipo",
    label: "上交所｜IPO 发行列表",
    market: "A",
    kind: "交易所接口",
    url: "https://www.sse.com.cn/ipo/",
    endpoint: "https://query.sse.com.cn/commonQuery.do",
    note: "上交所公开发行列表：代码、名称、发行价、发行市盈率、申购日、缴款日和上市日",
  },
  szse: {
    id: "szse-ipo",
    label: "深交所｜IPO 项目动态",
    market: "A",
    kind: "交易所接口",
    url: "https://www.szse.cn/listing/projectdynamic/ipo/index.html",
    endpoint: "https://www.szse.cn/api/ras/projectrends/query",
    note: "深交所公开项目动态：项目、板块、行业、保荐机构和审核状态",
  },
  hkexNew: {
    id: "hkex-new",
    label: "HKEX｜New Listing Information",
    market: "HK",
    kind: "交易所页面",
    url: "https://www2.hkexnews.hk/New-Listings/New-Listing-Information/Main-Board?sc_lang=en",
    note: "港交所新上市公告、招股书和配发结果官方列表",
  },
  hkexNewZh: {
    id: "hkex-new-zh",
    label: "HKEX｜新上市资料（中文）",
    market: "HK",
    kind: "交易所页面",
    url: "https://www2.hkexnews.hk/New-Listings/New-Listing-Information/Main-Board?sc_lang=zh-CN",
    note: "用于统一港股项目展示名称；中文名称来自港交所官方中文新上市资料页面",
  },
  hkexProgress: {
    id: "hkex-progress",
    label: "HKEX｜Application Progress",
    market: "HK",
    kind: "交易所页面",
    url: "https://www2.hkexnews.hk/New-Listings/Progress-Report-for-New-Listing-Applications/Main-Board?sc_lang=en",
    note: "港交所新上市申请处理状态与月度统计",
  },
  aHistory: {
    id: "a-ipo-history",
    label: "沪深 A 股｜IPO 发行上市历史",
    market: "A",
    kind: "全市场发行清单",
    url: "https://data.eastmoney.com/xg/xg/",
    note: "用于补齐沪深市场 2024 至今完整发行上市清单；交易所项目动态与原始文件继续作为一手证据",
  },
  hkexHistory: {
    id: "hkex-history",
    label: "HKEX｜Annual New Listing Report",
    market: "HK",
    kind: "港交所年度 XLSX",
    url: "https://www2.hkexnews.hk/New-Listings/New-Listing-Information/Main-Board?sc_lang=en",
    note: "港交所 2024 至今主板新上市年度清单，覆盖代码、上市日、发售价、发行股份与募资额",
  },
  hkMarket: {
    id: "hk-market",
    label: "腾讯｜港股日线行情",
    market: "HK",
    kind: "行情接口",
    url: "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get",
    note: "用于补齐港股 IPO 上市首日开盘、收盘、最高、最低与成交量；不替代港交所原始文件",
  },
  benchmark: {
    id: "market-benchmark",
    label: "东方财富｜上市首日基准指数",
    market: "A/H",
    kind: "指数行情接口",
    url: "https://push2his.eastmoney.com/api/qt/stock/kline/get",
    note: "按市场与板块匹配上证指数、深证成指、创业板指、科创50或恒生指数，计算上市首日相对差值",
  },
};

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 IPO-XRAY/0.2";
const PDF_PARSER_VERSION = "0.4.5";

function clean(value = "") {
  return String(value)
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textFromHtml(value = "") {
  return clean(value).replace(/\u00a0/g, " ").trim();
}

function valid(value) {
  return value !== undefined && value !== null && value !== "" && value !== "-" && value !== "—";
}

function asNumber(value) {
  if (!valid(value)) return null;
  const number = Number(String(value).replaceAll(",", ""));
  return Number.isFinite(number) ? number : null;
}

function formatNumber(value, digits = 2) {
  const number = asNumber(value);
  if (number === null) return "待接入";
  return number.toLocaleString("zh-CN", { maximumFractionDigits: digits });
}

function formatDate(value) {
  if (!valid(value)) return "待接入";
  return String(value).replaceAll("/", "-");
}

function formatNow() {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

async function fetchText(url, { referer, timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/json,application/javascript,*/*;q=0.8",
        Referer: referer || "https://www.sse.com.cn/ipo/",
        "User-Agent": USER_AGENT,
      },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsonp(value) {
  const body = value.replace(/^\s*[\w$]+\s*\(/, "").replace(/\)\s*;?\s*$/, "");
  return JSON.parse(body);
}

function sourceRowsFromTable(html, tablePattern) {
  const table = html.match(tablePattern)?.[0] || "";
  return [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((match) => match[1])
    .map((row) => ({
      cells: [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cell[1]),
      links: [...row.matchAll(/href=["']([^"']+)["']/gi)].map((match) => match[1]),
    }))
    .filter((row) => row.cells.length > 0);
}

function sourceLink(label, url) {
  return url ? { label, kind: "官方文件", url } : null;
}

function sseBoard(code = "") {
  if (code.startsWith("688") || code.startsWith("689")) return "科创板";
  return "沪市主板";
}

function sseStage(row) {
  if (valid(row.LISTED_DATE)) return "待上市";
  if (valid(row.ISSUE_PRICE)) return "发行中";
  return "发行待定";
}

function nextSseEvent(row) {
  const today = new Date().toISOString().slice(0, 10);
  const candidates = [
    ["网上申购", row.ONLINE_ISSUANCE_DATE],
    ["缴款", row.PAYMENT_START_DATE],
    ["上市", row.LISTED_DATE],
    ["中签率公告", row.ANNOUNCE_SUCC_RATE_RS_DATE],
  ]
    .filter(([, date]) => valid(date) && date >= today)
    .sort((a, b) => a[1].localeCompare(b[1]));
  return candidates[0] ? `${candidates[0][0]} ${candidates[0][1]}` : "资料核验";
}

function sseStagePath(stage) {
  if (stage === "待上市") return [
    { label: "发行", state: "done" },
    { label: "缴款", state: "done" },
    { label: "上市", state: "active" },
    { label: "上市后", state: "pending" },
  ];
  if (stage === "发行中") return [
    { label: "发行", state: "active" },
    { label: "缴款", state: "pending" },
    { label: "上市", state: "pending" },
    { label: "上市后", state: "pending" },
  ];
  return [
    { label: "发行", state: "active" },
    { label: "缴款", state: "pending" },
    { label: "上市", state: "pending" },
    { label: "上市后", state: "pending" },
  ];
}

function normalizeSse(row) {
  const code = row.SECURITY_CODE || "—";
  const stage = sseStage(row);
  const event = nextSseEvent(row);
  const status = statusMeta(stage);
  return {
    id: `A-SSE-${code}`,
    market: "A",
    board: sseBoard(code),
    code,
    name: row.SECURITY_NAME || row.SECURITY_EXPAND_NAME || "未命名项目",
    sector: "沪市 IPO 发行列表",
    recordType: "listing",
    stage,
    stageKey: status.key,
    stageTone: status.tone,
    event,
    date: formatDate(row.LISTED_DATE || row.ONLINE_ISSUANCE_DATE),
    updated: formatDate(row.ONLINE_ISSUANCE_DATE || row.LISTED_DATE || formatNow().slice(0, 10)),
    dataQuality: "上交所官方实时",
    tags: ["A股", sseBoard(code), "发行列表"],
    thesis: "先把发行价、发行市盈率、申购与上市节点接回原始发行列表，再判断发行定价和上市后的兑现压力。",
    stagePath: sseStagePath(stage),
    lens: [
      { label: "发行价", value: valid(row.ISSUE_PRICE) ? `¥${formatNumber(row.ISSUE_PRICE)}` : "待接入", note: "上交所发行列表", tone: valid(row.ISSUE_PRICE) ? "live" : "muted" },
      { label: "发行 PE", value: valid(row.ISSUANCE_PRICE_EARNINGS_RATIO) ? `${formatNumber(row.ISSUANCE_PRICE_EARNINGS_RATIO)}x` : "待接入", note: "上交所发行列表", tone: valid(row.ISSUANCE_PRICE_EARNINGS_RATIO) ? "live" : "muted" },
      { label: "网上申购日", value: formatDate(row.ONLINE_ISSUANCE_DATE), note: "发行日字段", tone: "muted" },
      { label: "上市日", value: formatDate(row.LISTED_DATE), note: "上市日字段", tone: "muted" },
    ],
    ownership: [
      { label: "网上发行", value: null, note: "股本结构尚未拆解" },
      { label: "网下发行", value: null, note: "股本结构尚未拆解" },
      { label: "控股股东 / 管理层", value: null, note: "待招股书解析" },
    ],
    proceeds: [
      { label: "初始发行量", value: valid(row.TOTAL_INITIAL_ISSUE) ? null : null, note: valid(row.TOTAL_INITIAL_ISSUE) ? `原始值 ${row.TOTAL_INITIAL_ISSUE}` : "待接入" },
      { label: "实际募资", value: null, note: valid(row.ACTUAL_FUNDS_RAISED) ? `原始值 ${row.ACTUAL_FUNDS_RAISED}` : "待接入" },
      { label: "募集资金用途", value: null, note: "待招股书解析" },
    ],
    flags: [
      valid(row.ISSUE_PRICE) ? "发行定价已接入" : "发行定价待接入",
      valid(row.LISTED_DATE) ? "上市节点已接入" : "上市节点待接入",
    ],
    sources: ["sse-ipo"],
    documentLinks: [],
    raw: {
      issuePrice: row.ISSUE_PRICE,
      pe: row.ISSUANCE_PRICE_EARNINGS_RATIO,
      onlineDate: row.ONLINE_ISSUANCE_DATE,
      paymentDate: row.PAYMENT_START_DATE,
      listedDate: row.LISTED_DATE,
    },
  };
}

async function fetchSse(limit) {
  const url = new URL(SOURCES.sse.endpoint);
  const params = {
    jsonCallBack: "ipoData",
    isPagination: "true",
    sqlId: "COMMON_SSE_IPO_IPO_LIST_L",
    "pageHelp.pageSize": String(limit),
    "pageHelp.cacheSize": "1",
    stockType: "",
    isIssue: "1",
    isListing: "",
    isNotStatus: "99",
  };
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const payload = parseJsonp(await fetchText(url, { referer: SOURCES.sse.url }));
  const pageHelp = payload.pageHelp || {};
  return {
    projects: (pageHelp.data || []).map(normalizeSse),
    total: pageHelp.total || pageHelp.data?.length || 0,
    fetchedAt: formatNow(),
  };
}

function szseStagePath(stage) {
  const normalized = String(stage || "");
  const end = normalized === "终止" || normalized === "中止";
  const inquiry = normalized.includes("问询") || normalized.includes("受理");
  const hearing = normalized.includes("上市委");
  const registration = normalized.includes("注册");
  return [
    { label: "受理", state: inquiry || hearing || registration ? "done" : end ? "done" : "active" },
    { label: "问询", state: hearing || registration ? "done" : inquiry ? "active" : end ? "pending" : "pending" },
    { label: "上会", state: registration ? "done" : hearing ? "active" : "pending" },
    { label: "注册 / 发行", state: registration ? "active" : "pending" },
  ];
}

function normalizeSzse(row) {
  const stage = row.prjst || "项目动态";
  const isClosed = stage === "终止" || stage === "中止";
  const status = statusMeta(stage);
  return {
    id: `A-SZSE-${row.prjid}`,
    market: "A",
    board: row.boardName || "深交所",
    code: row.cmpcode || "—",
    name: row.cmpnm || row.cmpsnm || "未命名项目",
    sector: row.csrcind || "深市 IPO 项目",
    recordType: "application",
    stage,
    stageKey: status.key,
    stageTone: status.tone,
    event: isClosed ? stage : (row.updtdt ? `状态更新 ${row.updtdt}` : "审核节点核验"),
    date: row.updtdt || row.acptdt || null,
    updated: row.updtdt || row.acptdt || "待接入",
    dataQuality: "深交所官方实时",
    tags: ["A股", row.boardName || "深交所", stage],
    thesis: "把受理、问询、上会、注册的状态变化和行业、保荐机构放在同一张项目卡里，后续再补招股书与问询回复证据。",
    stagePath: szseStagePath(stage),
    lens: [
      { label: "拟募资", value: valid(row.maramt) ? formatNumber(row.maramt) : "待接入", note: "深交所接口原值，单位遵循官方页面", tone: valid(row.maramt) ? "live" : "muted" },
      { label: "受理日期", value: formatDate(row.acptdt), note: "项目动态字段", tone: "muted" },
      { label: "最近更新", value: formatDate(row.updtdt), note: "项目动态字段", tone: "muted" },
      { label: "保荐机构", value: row.sprinsts || row.sprinst || "待接入", note: "项目动态字段", tone: "muted" },
    ],
    ownership: [
      { label: "公众股东", value: null, note: "待招股书解析" },
      { label: "控股股东", value: null, note: "待招股书解析" },
      { label: "实际控制人", value: null, note: "待招股书解析" },
    ],
    proceeds: [
      { label: "拟募资金额", value: null, note: valid(row.maramt) ? `接口原值 ${row.maramt}` : "待接入" },
      { label: "募资用途", value: null, note: "待招股书解析" },
      { label: "研发投入", value: null, note: "待财务数据解析" },
    ],
    flags: [
      `保荐机构：${row.sprinsts || row.sprinst || "待接入"}`,
      row.csrcind ? `行业：${row.csrcind}` : "行业待接入",
    ],
    sources: ["szse-ipo"],
    documentLinks: [{ label: "深交所项目详情", kind: "官方页面", url: `https://www.szse.cn/listing/projectdynamic/ipo/detail/index.html?id=${encodeURIComponent(row.prjid)}` }],
    raw: {
      projectId: row.prjid,
      sponsor: row.sprinst,
      acceptanceDate: row.acptdt,
      updateDate: row.updtdt,
      amount: row.maramt,
    },
  };
}

async function fetchSzse(limit, startDate = HISTORY_START, endDate = new Date().toISOString().slice(0, 10)) {
  const url = new URL(SOURCES.szse.endpoint);
  const params = {
    bizType: "1",
    boardCode: "",
    pageIndex: "0",
    pageSize: String(limit),
    startDate,
    endDate,
    random: String(Math.random()),
  };
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const payload = JSON.parse(await fetchText(url, { referer: SOURCES.szse.url }));
  const rows = Array.isArray(payload.data) ? payload.data : [];
  return {
    projects: rows.map(normalizeSzse),
    total: payload.totalSize || rows.length,
    fetchedAt: formatNow(),
  };
}

const SZSE_DETAIL_ENDPOINT = "https://www.szse.cn/api/ras/projectrends/details";
const SZSE_REPORT_BASE = "https://reportdocs.static.szse.cn";

export async function fetchSzseProjectDetail(projectId) {
  const url = new URL(SZSE_DETAIL_ENDPOINT);
  url.searchParams.set("id", String(projectId));
  url.searchParams.set("r", String(Math.random()));
  const payload = JSON.parse(await fetchText(url, { referer: `https://www.szse.cn/listing/projectdynamic/ipo/detail/index.html?id=${projectId}` }));
  const data = payload.data || {};
  const materials = Array.isArray(data.disclosureMaterials) ? data.disclosureMaterials : [];
  const documentLinks = materials.slice(0, 8).map((material) => ({
    label: material.dfnm || material.configFileName || material.matnm || "深交所披露文件",
    kind: "官方 PDF",
    url: new URL(material.dfpth, SZSE_REPORT_BASE).toString(),
    date: material.ddt || material.ddtime || null,
  }));
  const prospectus = materials.find((material) => /招股说明书|招股书/.test(`${material.dfnm || ""}${material.matnm || ""}`));
  return {
    data,
    documentLinks,
    prospectusUrl: prospectus?.dfpth ? new URL(prospectus.dfpth, SZSE_REPORT_BASE).toString() : null,
  };
}

function parseSzseProspectus(rawText) {
  const text = normalizePdfText(rawText);
  const rawNormalized = String(rawText).replace(/\s+/g, " ").trim();
  const raise = pdfEvidence(text, /募集资金(?:投资\s*项目|用途)[\s\S]{0,3500}?合计\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)/i);
  const newShares = pdfEvidence(text, /发行新股数量\s*不超过\s*([\d,]+\.\d+)\s*万股/i)
    || pdfEvidence(text, /发行股份数量\s*不超过\s*([\d,]+\.\d+)\s*万股/i);
  const publicRatio = pdfEvidence(text, /发行新股数量[\s\S]{0,220}?占发行后总股本比例\s*不低于\s*([\d.]+)%/i);
  const revenue = pdfEvidence(text, /营业收入（万元）\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)/i);
  const netProfit = pdfEvidence(text, /净利润（万元）\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)/i);
  const operatingCash = pdfEvidence(text, /经营活动产生的现金流量净额（万元）\s+(-?[\d,]+\.\d+)\s+(-?[\d,]+\.\d+)\s+(-?[\d,]+\.\d+)/i);
  const rdRatio = pdfEvidence(text, /研发投入占营业收入的比例\s*（%）\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
  const grossProfit = pdfEvidence(text, /毛利（万元）\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)/i);
  const grossMargin = pdfEvidence(text, /毛利率\s*（%）\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
  const totalAssets = pdfEvidence(text, /资产总额（万元）\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)/i);
  const totalLiabilities = pdfEvidence(text, /负债总额（万元）\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)/i);
  const accountsReceivable = pdfEvidence(text, /应收账款（万元）\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)/i);
  const inventory = pdfEvidence(text, /存货（万元）\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)/i);
  const customerConcentration = pdfEvidence(text, /前五大客户[^\d%]{0,120}?占营业收入比例[^\d%]{0,30}([\d.]+)%/i);
  const sectionMatches = [...rawNormalized.matchAll(/募集资金(?:投资\s*项目|用途)/gi)];
  const sectionStart = sectionMatches.find((match) => (match.index || 0) > 25000)?.index ?? -1;
  const fundingSection = sectionStart >= 0 ? rawNormalized.slice(sectionStart, sectionStart + 7000) : "";
  const fundingEvidence = pdfEvidence(text, /募集资金(?:投资\s*项目|用途)/i);
  const projectRows = [...fundingSection.matchAll(/(?:^|\s)([1-9])\s+([\u4e00-\u9fffA-Za-z0-9（）()、，\s]{4,100}?)\s+([\u4e00-\u9fffA-Za-z0-9（）()、，\s]{2,20})\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)/g)]
    .map((match) => ({ label: `${match[2]} ${match[3]}`.replace(/\s+[\u4e00-\u9fffA-Za-z]{2,20}$/, "").replace(/\s+/g, "").trim(), value: amount(match[5]), amount: match[4] }))
    .filter((row) => row.label && row.value !== null)
    .slice(0, 8);
  const totalRaise = amount(raise?.groups[1] || raise?.groups[0]);
  const useOfProceeds = projectRows.length && totalRaise
    ? projectRows.map((row) => ({ label: row.label, value: Math.round((row.value / totalRaise) * 1000) / 10, amount: row.value, unit: "万元", note: `招股书拟投入 ${formatNumber(row.value)} 万元${fundingEvidence?.page ? ` · 第 ${fundingEvidence.page} 页` : ""}` }))
    : [];
  const financials = {
    unit: "万元",
    revenue: { values: revenue?.groups.slice(0, 3).map(amount) || [], evidence: revenue },
    grossProfit: { values: grossProfit?.groups.slice(0, 3).map(amount) || [], evidence: grossProfit },
    netProfit: { values: netProfit?.groups.slice(0, 3).map(amount) || [], evidence: netProfit },
    operatingCash: { values: operatingCash?.groups.slice(0, 3).map(amount) || [], evidence: operatingCash },
    rdRatio: { values: rdRatio?.groups.slice(0, 3).map(amount) || [], evidence: rdRatio },
    grossMargin: { values: grossMargin?.groups.slice(0, 3).map(amount) || [], evidence: grossMargin },
    totalAssets: { values: totalAssets?.groups.slice(0, 3).map(amount) || [], evidence: totalAssets },
    totalLiabilities: { values: totalLiabilities?.groups.slice(0, 3).map(amount) || [], evidence: totalLiabilities },
    accountsReceivable: { values: accountsReceivable?.groups.slice(0, 3).map(amount) || [], evidence: accountsReceivable },
    inventory: { values: inventory?.groups.slice(0, 3).map(amount) || [], evidence: inventory },
    customerConcentration: { value: amount(customerConcentration?.groups?.[0]), evidence: customerConcentration },
  };
  return {
    status: "parsed",
    fields: {
      raise: { value: totalRaise, evidence: raise },
      newShares: { value: amount(newShares?.groups[0]), evidence: newShares },
      publicRatio: { value: amount(publicRatio?.groups[0]), evidence: publicRatio },
      revenue: { values: revenue?.groups.slice(0, 3).map(amount) || [], evidence: revenue },
      netProfit: { values: netProfit?.groups.slice(0, 3).map(amount) || [], evidence: netProfit },
      operatingCash: { values: operatingCash?.groups.slice(0, 3).map(amount) || [], evidence: operatingCash },
      rdRatio: { values: rdRatio?.groups.slice(0, 3).map(amount) || [], evidence: rdRatio },
      financials,
      periods: inferPeriods(text),
      profitQuality: parseProfitQuality(financials),
      customerConcentration: financials.customerConcentration,
      useOfProceeds,
    },
  };
}

export async function enrichSzseProject(project) {
  const detail = await fetchSzseProjectDetail(project.raw?.projectId || project.id.replace(/^A-SZSE-/, ""));
  const document = detail.prospectusUrl ? await extractPdfText(detail.prospectusUrl, { referer: "https://www.szse.cn/listing/projectdynamic/ipo/index.html" }) : null;
  const parsed = document ? parseSzseProspectus(document.text) : { fields: {} };
  const fields = parsed.fields || {};
  const latest = (field) => field?.values?.at(-1) ?? null;
  const proceeds = fields.useOfProceeds?.length ? fields.useOfProceeds : project.proceeds;
  const issue = {
    ...(project.issue || {}),
    prospectusRaiseWan: fields.raise?.value ?? null,
    prospectusNewSharesWan: fields.newShares?.value ?? null,
    publicRatio: fields.publicRatio?.value ?? null,
  };
  const financials = {
    mainBusiness: project.sector || null,
    unit: fields.financials?.unit || "万元",
    periods: fields.periods || [],
    metrics: fields.financials || {},
    profitQuality: fields.profitQuality || [],
    customerConcentration: fields.customerConcentration || null,
    bvps: project.financials?.bvps ?? null,
  };
  return {
    ...project,
    dataQuality: document ? "深交所官方 + 招股书解析" : "深交所官方详情",
    documentLinks: detail.documentLinks,
    detailLoaded: true,
    lens: [
      { label: "拟募资", value: fields.raise?.value ? `${formatNumber(fields.raise.value)} 万元` : project.lens[0]?.value || "待接入", note: evidenceNote(fields.raise?.evidence, "深交所招股书"), tone: fields.raise?.value ? "live" : "muted" },
      { label: "发行股数", value: fields.newShares?.value ? `${formatNumber(fields.newShares.value)} 万股` : "待接入", note: evidenceNote(fields.newShares?.evidence, "发行概况"), tone: fields.newShares?.value ? "live" : "muted" },
      { label: "2025 营收", value: latest(fields.revenue) ? `${formatNumber(latest(fields.revenue))} 万元` : "待接入", note: evidenceNote(fields.revenue?.evidence, "财务数据"), tone: latest(fields.revenue) ? "live" : "muted" },
      { label: "2025 净利润", value: latest(fields.netProfit) ? `${formatNumber(latest(fields.netProfit))} 万元` : "待接入", note: evidenceNote(fields.netProfit?.evidence, "财务数据"), tone: latest(fields.netProfit) ? "live" : "muted" },
    ],
    issue,
    ownership: [
      { label: "发行新股比例", value: fields.publicRatio?.value ?? null, note: evidenceNote(fields.publicRatio?.evidence, "发行概况") },
      { label: "发行股数", value: null, note: fields.newShares?.value ? `${formatNumber(fields.newShares.value)} 万股 · ${evidenceNote(fields.newShares?.evidence, "发行概况")}` : "待发行概况解析" },
      { label: "控股股东", value: null, note: "待股权章节解析" },
      { label: "实际控制人", value: null, note: "待股权章节解析" },
    ],
    proceeds,
    financials,
    business: {
      mainBusiness: project.raw?.detail?.mainBusiness || project.sector || null,
      customerConcentration: fields.customerConcentration || null,
    },
    flags: [...project.flags, ...(document ? ["招股书字段已解析", "财务数据已接入"] : ["已接入深交所详情文件"])],
    raw: { ...project.raw, detail: detail.data, prospectus: fields },
  };
}

function extractLinks(cell) {
  return [...String(cell || "").matchAll(/href=["']([^"']+)["']/gi)].map((match) => match[1]);
}

function normalizePdfText(value = "") {
  return String(value)
    .replace(/\/?H\d+\/?/g, " ")
    .replace(/\s+/g, " ")
    .replace(/([\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, "$1")
    .trim();
}

function pdfEvidence(text, pattern) {
  const match = text.match(pattern);
  if (!match) return null;
  const index = match.index || 0;
  const pageMatches = [...text.slice(0, index).matchAll(/\[\[PAGE\s+(\d+)\]\]/g)];
  const page = pageMatches.at(-1)?.[1] ? Number(pageMatches.at(-1)[1]) : null;
  const snippet = text.slice(Math.max(0, index - 90), index + 260)
    .replace(/\[\[PAGE\s+\d+\]\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return { groups: match.slice(1), page, snippet };
}

function seriesEvidence(text, pattern) {
  const evidence = pdfEvidence(text, pattern);
  if (!evidence) return null;
  const values = String(evidence.groups?.[0] || "")
    .match(/-?\(?\d[\d,]*(?:\.\d+)?\)?/g)
    ?.map((value) => amount(value))
    .filter((value) => value !== null) || [];
  return { values, page: evidence.page, snippet: evidence.snippet };
}

function inferPeriods(text) {
  const header = text.match(/For the[\s\S]{0,260}?\((?:S\$|RMB|HK\$)[^)]*\)/i)?.[0];
  const match = text.match(/(?:For the year ended|截至|报告期)[\s\S]{0,180}?((?:20\d{2}\s+){2,4}20\d{2})/i);
  const headerYears = String(header || "").match(/20\d{2}/g) || [];
  const years = headerYears.length >= 3 ? headerYears : String(match?.[1] || "").match(/20\d{2}/g) || [];
  if (!years?.length) return ["近一期", "前一期", "前二期"];
  const seen = new Map();
  return years.map((year) => {
    const count = (seen.get(year) || 0) + 1;
    seen.set(year, count);
    return count === 1 ? year : `${year} 期中`;
  });
}

function parseProfitQuality(financials) {
  const revenue = financials.revenue?.values || [];
  const netProfit = financials.netProfit?.values || [];
  const operatingCash = financials.operatingCash?.values || [];
  const latestRevenue = revenue.at(-1);
  const latestProfit = netProfit.at(-1);
  const latestCash = operatingCash.at(-1);
  return [
    { label: "净利率", value: latestRevenue !== null && latestProfit !== null && latestRevenue !== 0 ? `${formatNumber(latestProfit / latestRevenue * 100, 1)}%` : "待核验", note: "净利润 / 营业收入" },
    { label: "经营现金净额 / 净利润", value: latestCash !== null && latestProfit !== null && latestProfit !== 0 ? `${formatNumber(latestCash / latestProfit * 100, 1)}%` : "待核验", note: "经营现金流覆盖利润程度" },
    { label: "利润与现金流", value: latestCash !== null && latestProfit !== null ? (latestCash >= latestProfit ? "现金流覆盖较好" : "现金流弱于利润") : "待核验", note: "基于招股书同期字段" },
  ];
}

function amount(value) {
  if (!valid(value)) return null;
  const number = Number(String(value).replaceAll(",", ""));
  return Number.isFinite(number) ? number : null;
}

function compactCurrency(value, currency = "HK$") {
  const number = amount(value);
  return number === null ? "待接入" : `${currency}${number.toLocaleString("en-US", { maximumFractionDigits: 1 })}m`;
}

function readableProceedsLabel(label = "") {
  if (/optical interconnect|R&D/i.test(label)) return "光互连研发";
  if (/global production capacity/i.test(label)) return "全球产能扩张";
  if (/supply chain|commercialization/i.test(label)) return "供应链与商业化";
  if (/strategic acquisitions/i.test(label)) return "战略收购与投资";
  if (/general corporate purposes/i.test(label)) return "营运资金与一般公司用途";
  if (/Mega Depot/i.test(label)) return "Mega Depot 建设与开发";
  if (/repayment of the loan|interest expenses/i.test(label)) return "偿还贷款 / 利息";
  if (/working capital/i.test(label)) return "营运资金";
  return label.replace(/\s+/g, " ").trim();
}

function parseUseOfProceeds(text) {
  const sectionMatches = [...text.matchAll(/FUTURE PLANS AND USE OF PROCEEDS/gi)];
  const sectionMatch = sectionMatches.find((match) => (match.index || 0) > 50000) || sectionMatches[0];
  const section = text.slice(sectionMatch?.index || 0, (sectionMatch?.index || 0) + 50000);
  const summaryEnd = section.search(/OUR SINGLE LARGEST GROUP OF SHAREHOLDERS|SUMMARY\s+\d+/i);
  const summary = summaryEnd > 0 ? section.slice(0, summaryEnd) : section;
  const percentageRows = [...summary.matchAll(/approximately\s+([\d.]+)%[\s\S]{0,260}?will be allocated\s+(?:for|to)\s+([\s\S]+?)(?=\s*;\s*(?:and\s*)?\([ivx]+\)|\s+For details|$)/gi)]
    .slice(0, 8)
    .map((match) => ({ label: readableProceedsLabel(match[2]), value: Number(match[1]), note: `招股书披露 ${match[1]}%` }));
  if (percentageRows.length) return percentageRows;

  const amountRows = [...section.matchAll(/S\$([\d.]+)\s*million\s*\(equivalent to approximately\s*HK\$([\d.]+)\s*million\)\s*(?:for|will be kept as)\s+(.+?)(?=\s*;\s*(?:and\s*)?\(?[ivx]+\)?\s*S\$|\.|$)/gi)]
    .slice(0, 6)
    .map((match) => ({ amountSgd: Number(match[1]), amountHkd: Number(match[2]), label: match[3].trim() }));
  const total = amountRows.reduce((sum, row) => sum + row.amountSgd, 0);
  return amountRows.map((row) => ({
    label: readableProceedsLabel(row.label),
    value: total ? Math.round((row.amountSgd / total) * 1000) / 10 : null,
    amountSgd: row.amountSgd,
    amountHkd: row.amountHkd,
    note: `招股书披露 S$${row.amountSgd}m，按三项金额折算`,
  }));
}

function parseHkexProspectus(rawText) {
  const text = normalizePdfText(rawText);
  const offerShares = pdfEvidence(text, /Number of Offer Shares under the Global Offering\s*:\s*([\d,]+)\s+(?:H\s+)?Shares/i);
  const hkOfferShares = pdfEvidence(text, /Number of Hong Kong Offer Shares\s*:\s*([\d,]+)\s+(?:H\s+)?Shares/i);
  const internationalShares = pdfEvidence(text, /Number of International Offer Shares\s*:\s*([\d,]+)\s+(?:H\s+)?Shares/i);
  const offerPrice = pdfEvidence(text, /(?:Maximum Offer Price|Offer Price)\s*:\s*(?:Not more than\s*)?HK\$([\d,.]+)/i);
  const lowerOfferPrice = pdfEvidence(text, /currently expected to be no less than HK\$([\d,.]+)/i);
  const netProceeds = pdfEvidence(text, /net proceeds(?: from the Global Offering)?\s+of\s+approximately\s+(?:S\$[\d.]+\s*million\s*\(equivalent to approximately\s*)?HK\$([\d,.]+)\s*million/i);
  const cornerstone = pdfEvidence(text, /total number of Offer Shares to be subscribed for by the Cornerstone Investors would be\s*([\d,]+)\s+H Shares, representing approximately\s*\(i\)\s*([\d.]+)%/i);
  const cornerstoneAmount = pdfEvidence(text, /aggregate amount of approximately\s*US\$([\d,.]+)\s*million\s*\(or approximately\s*HK\$([\d,.]+)\s*million/i);
  const largestGroup = pdfEvidence(text, /total issued share capital of our Company was held as to approximately\s*([\d.]+)%\s+by our Single Largest Group of Shareholders/i);
  const revenue = seriesEvidence(text, /\bRevenue\s+((?:\(?-?[\d,]+(?:\.\d+)?\)?\s+){2,5})/i);
  const grossProfit = seriesEvidence(text, /\bGross profit\s+((?:\(?-?[\d,]+(?:\.\d+)?\)?\s+){2,5})/i);
  const netProfit = seriesEvidence(text, /(?:Profit for the year|Net profit)(?: attributable to owners of the Company)?\s+((?:\(?-?[\d,]+(?:\.\d+)?\)?\s+){2,5})/i);
  const operatingCash = seriesEvidence(text, /Net cash (?:generated from|from) operating activities\s+((?:\(?-?[\d,]+(?:\.\d+)?\)?\s+){2,5})/i);
  const grossMargin = seriesEvidence(text, /Gross profit margin\s+((?:[\d.]+%?\s+){2,5})/i);
  const netMargin = seriesEvidence(text, /Net profit margin\s+((?:[\d.]+%?\s+){2,5})/i);
  const rdExpense = seriesEvidence(text, /Research and development expenses\s+((?:\(?-?[\d,]+(?:\.\d+)?\)?\s+){2,5})/i);
  const totalAssets = seriesEvidence(text, /Total assets\s+((?:\(?-?[\d,]+(?:\.\d+)?\)?\s+){2,5})/i);
  const totalLiabilities = seriesEvidence(text, /Total liabilities\s+((?:\(?-?[\d,]+(?:\.\d+)?\)?\s+){2,5})/i);
  const customerConcentration = pdfEvidence(text, /(?:our\s+)?largest customer(?!s)[\s\S]{0,420}?(?:accounted for|representing)\s*(?:approximately\s*)?([\d.]+)%/i);
  const topFiveCustomers = pdfEvidence(text, /(?:five largest customers|top five customers)[\s\S]{0,620}?(?:accounted for|representing)\s*(?:approximately\s*)?([\d.]+)%/i);
  const financials = {
    unit: text.match(/\((?:S\$|RMB|HK\$)[^)]*\)/i)?.[0] || "原始财务表单位",
    periods: inferPeriods(text),
    revenue,
    grossProfit,
    netProfit,
    operatingCash,
    grossMargin,
    netMargin,
    rdExpense,
    totalAssets,
    totalLiabilities,
    customerConcentration,
    topFiveCustomers,
  };
  const useOfProceeds = parseUseOfProceeds(text);
  const total = amount(offerShares?.groups[0]);
  const hongKong = amount(hkOfferShares?.groups[0]);
  const maximumPrice = amount(offerPrice?.groups[0]);
  return {
    status: "parsed",
    fields: {
      offerShares: { value: total, evidence: offerShares },
      hkOfferShares: { value: hongKong, evidence: hkOfferShares },
      internationalShares: { value: amount(internationalShares?.groups[0]), evidence: internationalShares },
      offerPrice: { value: maximumPrice, lowerValue: amount(lowerOfferPrice?.groups[0]), evidence: offerPrice, lowerEvidence: lowerOfferPrice },
      netProceeds: { value: amount(netProceeds?.groups[0]), evidence: netProceeds },
      publicOfferRatio: { value: total && hongKong ? Math.round((hongKong / total) * 1000) / 10 : null, evidence: hkOfferShares },
      cornerstoneRatio: { value: amount(cornerstone?.groups[1]), evidence: cornerstone },
      cornerstoneShares: { value: amount(cornerstone?.groups[0]), evidence: cornerstone },
      cornerstoneAmount: { value: amount(cornerstoneAmount?.groups[1]), evidence: cornerstoneAmount },
      largestShareholderGroup: { value: amount(largestGroup?.groups[0]), evidence: largestGroup },
      financials,
      profitQuality: parseProfitQuality(financials),
      business: {
        customerConcentration,
        topFiveCustomers,
      },
      useOfProceeds,
    },
  };
}

function evidenceNote(evidence, fallback) {
  return evidence?.page ? `${fallback} · 招股书第 ${evidence.page} 页` : fallback;
}

function enrichHkexProject(project, document) {
  const fields = document?.fields;
  if (!fields) return project;
  const price = fields.offerPrice?.value;
  const lowerPrice = fields.offerPrice?.lowerValue;
  const priceLabel = lowerPrice ? "发售价区间" : "最高发售价";
  const priceValue = price === null || price === undefined
    ? "待接入"
    : lowerPrice ? `HK$${formatNumber(lowerPrice)}–${formatNumber(price)}` : `HK$${formatNumber(price)}`;
  const gross = fields.offerShares?.value && price ? fields.offerShares.value * price / 1_000_000 : null;
  const proceedsValue = fields.netProceeds?.value ? compactCurrency(fields.netProceeds.value) : gross ? compactCurrency(gross) : "待接入";
  const proceedsNote = fields.netProceeds?.value
    ? evidenceNote(fields.netProceeds.evidence, "招股书净募资额")
    : evidenceNote(fields.offerPrice?.evidence, "按最高发售价 × 全球发售股份测算，未扣费用");
  const publicRatio = fields.publicOfferRatio?.value;
  const cornerstoneRatio = fields.cornerstoneRatio?.value;
  const useOfProceeds = fields.useOfProceeds?.length ? fields.useOfProceeds.map((row) => ({ ...row })) : project.proceeds;
  const grossProceedsHkd = gross === null ? project.issue?.grossProceedsHkd || null : gross * 1000000;
  const netProceedsHkd = fields.netProceeds?.value ? fields.netProceeds.value * 1000000 : null;
  const issue = {
    ...(project.issue || {}),
    issuePrice: price ?? project.issue?.issuePrice ?? null,
    issueShares: fields.offerShares?.value ?? project.issue?.issueShares ?? null,
    grossProceedsHkd,
    netProceedsHkd,
    publicOfferRatio: publicRatio ?? null,
    cornerstoneRatio: cornerstoneRatio ?? null,
  };
  const ownership = [
    { label: "单一最大股东集团", value: fields.largestShareholderGroup?.value ?? null, note: evidenceNote(fields.largestShareholderGroup?.evidence, "招股书股权章节") },
    { label: "公众发售比例", value: publicRatio ?? null, note: evidenceNote(fields.publicOfferRatio?.evidence, "按香港发售股份 / 全球发售股份计算") },
    { label: "基石投资者占比", value: cornerstoneRatio ?? null, note: cornerstoneRatio === null || cornerstoneRatio === undefined ? "招股书未识别明确基石比例" : evidenceNote(fields.cornerstoneRatio?.evidence, "占全球发售股份") },
  ];
  return {
    ...project,
    dataQuality: "港交所官方 + 招股书解析",
    issue,
    lens: [
      { label: priceLabel, value: priceValue, note: evidenceNote(fields.offerPrice?.evidence, "招股书发行条款"), tone: price ? "live" : "muted" },
      { label: "募资额", value: proceedsValue, note: proceedsNote, tone: fields.netProceeds?.value || gross ? "live" : "muted" },
      { label: "公众发售比例", value: publicRatio === null || publicRatio === undefined ? "待接入" : `${publicRatio}%`, note: evidenceNote(fields.publicOfferRatio?.evidence, "按招股书股份数计算"), tone: publicRatio ? "live" : "muted" },
      { label: "基石占比", value: cornerstoneRatio === null || cornerstoneRatio === undefined ? "待核验" : `${cornerstoneRatio}%`, note: cornerstoneRatio === null || cornerstoneRatio === undefined ? "招股书未识别明确比例" : evidenceNote(fields.cornerstoneRatio?.evidence, "Cornerstone Placing"), tone: cornerstoneRatio ? "live" : "muted" },
    ],
    ownership,
    proceeds: useOfProceeds.map((row) => ({
      ...row,
      amount: row.amountHkd ?? null,
      unit: row.amountHkd ? "百万港元" : row.amountSgd ? "百万新元" : "%",
    })),
    financials: fields.financials ? {
      unit: fields.financials.unit || "原始财务表单位",
      periods: fields.financials.periods || [],
      metrics: fields.financials,
      profitQuality: fields.profitQuality || [],
      mainBusiness: project.sector || null,
      customerConcentration: fields.business?.customerConcentration || null,
      topFiveCustomers: fields.business?.topFiveCustomers || null,
    } : project.financials || {},
    business: {
      mainBusiness: project.sector || null,
      customerConcentration: fields.business?.customerConcentration || null,
      topFiveCustomers: fields.business?.topFiveCustomers || null,
    },
    flags: [...project.flags, "招股书字段已解析", "字段保留原始页码证据"],
    raw: { ...project.raw, prospectus: fields },
  };
}

function parseHkexNewListing(html) {
  const pageText = textFromHtml(html);
  const updated = pageText.match(/Updated:\s*([0-9]{1,2}\s+[A-Za-z]{3}\s+20\d{2})/i)?.[1]
    || pageText.match(/更新日期[:：]\s*(20\d{2})年(\d{1,2})月(\d{1,2})日/)?.slice(1).join("-")
    || "待接入";
  const tableRows = sourceRowsFromTable(html, /<table\b[^>]*rte-table-mobile-list[^>]*>[\s\S]*?<\/table>/i);
  const projects = tableRows
    .filter((row) => row.cells.length >= 2)
    .map((row) => {
      const code = textFromHtml(row.cells[0]);
      const name = textFromHtml(row.cells[1]);
      const announcement = extractLinks(row.cells[2]);
      const prospectus = extractLinks(row.cells[3]);
      const allotment = extractLinks(row.cells[4]);
      if (!code || !name || !/^\d{4,5}$/.test(code)) return null;
      const hasAllotment = allotment.length > 0;
      const hasProspectus = prospectus.length > 0;
      const stage = hasAllotment ? "配发结果" : hasProspectus ? "招股书 / 公告" : "官方新上市索引";
      const status = statusMeta(stage);
      return {
        id: `HK-${code}`,
        market: "HK",
        board: "Main Board",
        code,
        name,
        sector: "HKEX 新上市列表",
        recordType: "application",
        stage,
        stageKey: status.key,
        stageTone: status.tone,
        event: hasAllotment ? "配发结果已发布" : hasProspectus ? "招股书 / 公告核验" : "官方资料核验",
        updated: updated === "待接入" ? formatNow().slice(0, 10) : updated,
        date: updated === "待接入" ? formatNow().slice(0, 10) : updated,
        dataQuality: "港交所官方实时",
        tags: ["港股", "新上市", hasAllotment ? "配发结果" : "资料待拆"],
        thesis: "先把招股书、公告和配发结果接回同一项目，再判断发行结构、基石、流通盘和上市后估值压力。",
        stagePath: [
          { label: "申请 / 递表", state: "done" },
          { label: "招股书", state: hasProspectus ? "done" : "active" },
          { label: "配发结果", state: hasAllotment ? "done" : "pending" },
          { label: "上市后", state: "pending" },
        ],
        lens: [
          { label: "发行价", value: "待接入", note: "招股书 / 配售公告 PDF", tone: "muted" },
          { label: "募资额", value: "待接入", note: "招股书募资用途", tone: "muted" },
          { label: "基石占比", value: "待接入", note: "配售结构", tone: "muted" },
          { label: "首日表现", value: "待接入", note: "上市后行情", tone: "muted" },
        ],
        ownership: [
          { label: "公众股东", value: null, note: "待招股书解析" },
          { label: "基石投资者", value: null, note: "待配售公告解析" },
          { label: "控股股东 / 管理层", value: null, note: "待招股书解析" },
        ],
        proceeds: [
          { label: "业务扩张", value: null, note: "待招股书解析" },
          { label: "研发 / 产能", value: null, note: "待招股书解析" },
          { label: "营运资金 / 其他", value: null, note: "待招股书解析" },
        ],
        flags: [
          hasProspectus ? "招股书链接已接入" : "招股书链接待接入",
          hasAllotment ? "配发结果链接已接入" : "配发结果待接入",
        ],
        sources: ["hkex-new", "hkex-progress"],
        documentLinks: [
          sourceLink("新上市公告", announcement[0]),
          sourceLink("招股书", prospectus[0]),
          sourceLink("配发结果", allotment[0]),
        ].filter(Boolean),
        raw: { announcement, prospectus, allotment, updated },
      };
    })
    .filter(Boolean);
  return { projects, updated, fetchedAt: formatNow() };
}

function parseProgressTable(table) {
  const rows = sourceRowsFromTable(table, /<table\b[^>]*progress-report-table[^>]*>[\s\S]*?<\/table>/i);
  return rows.map((row) => {
    const label = textFromHtml(row.cells.at(-2) || "");
    const valueText = textFromHtml(row.cells.at(-1) || "");
    const value = valueText.match(/[\d,]+/)?.[0]?.replaceAll(",", "") || null;
    return { label, value: value ? Number(value) : null };
  }).filter((row) => row.label);
}

function parseHkexProgress(html) {
  const pageText = textFromHtml(html);
  const updated = pageText.match(/\(as at\s+([^\)]+)\)/i)?.[1] || "待接入";
  const tables = [...html.matchAll(/<table\b[^>]*progress-report-table[^>]*>[\s\S]*?<\/table>/gi)].map((match) => match[0]);
  const processedRows = parseProgressTable(tables[0] || "");
  const statusRows = parseProgressTable(tables[1] || "");
  const findValue = (rows, pattern) => rows.find((row) => pattern.test(row.label))?.value ?? null;
  return {
    updated,
    total: findValue(processedRows, /TOTAL/i),
    listed: findValue(statusRows, /^Listed/i),
    approvedPending: findValue(statusRows, /Approved by the Listing Committee/i),
    underProcessing: findValue(statusRows, /Under processing/i),
    others: findValue(statusRows, /^Others/i),
    fetchedAt: formatNow(),
  };
}

async function enrichHkexProjects(projects, previousDocuments = {}) {
  const documents = { ...previousDocuments };
  const documentErrors = [];
  const enriched = await Promise.all(projects.map(async (project) => {
    const documentLink = project.documentLinks.find((link) => link.label === "招股书")
      || project.documentLinks.find((link) => link.label === "新上市公告");
    if (!documentLink) return project;
    const cached = documents[documentLink.url];
    if (cached?.status === "parsed" && cached.parserVersion === PDF_PARSER_VERSION && cached.fields) return enrichHkexProject(project, cached);
    try {
      const extracted = await extractPdfText(documentLink.url, { referer: SOURCES.hkexNew.url });
      const parsed = parseHkexProspectus(extracted.text);
      documents[documentLink.url] = {
        status: parsed.status,
        url: documentLink.url,
        kind: documentLink.label,
        parserVersion: PDF_PARSER_VERSION,
        fetchedAt: formatNow(),
        bytes: extracted.bytes,
        fields: parsed.fields,
      };
      return enrichHkexProject(project, parsed);
    } catch (error) {
      documentErrors.push(`${project.code}：${error.message}`);
      return project;
    }
  }));
  return { projects: enriched, documents, documentErrors };
}

async function fetchHkex(previousSnapshot = null) {
  const [newListingHtml, progressHtml, chineseListingResult] = await Promise.all([
    fetchText(SOURCES.hkexNew.url, { referer: "https://www.hkex.com.hk/" }),
    fetchText(SOURCES.hkexProgress.url, { referer: "https://www.hkex.com.hk/" }),
    fetchText(SOURCES.hkexNewZh.url, { referer: "https://www.hkex.com.hk/" }).then((html) => ({ html })).catch((error) => ({ error })),
  ]);
  const listing = parseHkexNewListing(newListingHtml);
  const chineseListing = chineseListingResult.html ? parseHkexNewListing(chineseListingResult.html) : { projects: [] };
  const chineseNames = new Map(chineseListing.projects.map((project) => [String(project.code).padStart(5, "0"), project.name]));
  listing.projects = listing.projects.map((project) => {
    const chineseName = chineseNames.get(String(project.code).padStart(5, "0"));
    const displayName = displayHkName(project.code, chineseName || project.name);
    return {
      ...project,
      name: displayName,
      sources: chineseName ? [...new Set([...(project.sources || []), "hkex-new-zh"])] : project.sources,
      raw: { ...project.raw, englishName: project.name, chineseName, displayName },
    };
  });
  const enriched = await enrichHkexProjects(listing.projects, previousSnapshot?.documents || {});
  return {
    ...listing,
    projects: enriched.projects,
    documents: enriched.documents,
    documentErrors: enriched.documentErrors,
    progress: parseHkexProgress(progressHtml),
    chineseListingFetched: Boolean(chineseListingResult.html),
    chineseListingError: chineseListingResult.error?.message || null,
  };
}

function healthSource(source, status, fetchedAt, error = null) {
  return { ...source, status, fetchedAt: fetchedAt || null, error };
}

function marketReview(label, projects, sourceTotal, progress) {
  const count = projects.length;
  const listed = projects.filter((project) => project.stageKey === "listed").length;
  const pipeline = projects.filter((project) => project.recordType === "application" && !["listed", "terminated"].includes(project.stageKey)).length;
  const scored = projects.filter((project) => project.score?.score !== null && project.score?.score !== undefined).length;
  if (label === "A 股") {
    return {
      headline: "审核进度与发行结果已经合到一张底表",
      description: "A 股侧同时覆盖深交所审核项目与沪深发行上市历史。进度看交易所项目动态，发行价、发行规模和首日表现看发行清单；同一公司不会因两类口径重复计数。",
      metrics: [
        { label: "区间项目", value: String(count), detail: `底表记录 / ${sourceTotal}` },
        { label: "已上市", value: String(listed), detail: "发行上市口径" },
        { label: "可评分", value: String(scored), detail: "缺失字段不硬打分" },
      ],
    };
  }
  return {
    headline: "年度新上市清单不再只看最近两家公司",
    description: `港股侧直接读取港交所年度 New Listing Report，并叠加近期招股书、配发结果和申请进度。申请进度统计更新于 ${progress?.updated || "待接入"}。`,
    metrics: [
      { label: "新上市项目", value: String(listed), detail: `年度报告 / ${sourceTotal || count} 条` },
      { label: "近期发行", value: String(pipeline), detail: "招股书 / 配发结果" },
      { label: "申请处理中", value: progress?.underProcessing === null ? "待接入" : String(progress?.underProcessing ?? "待接入"), detail: "HKEX 月度统计" },
    ],
  };
}

export async function buildSnapshot({ limit = 500, previousSnapshot = null } = {}) {
  const results = await Promise.allSettled([
    fetchSse(200),
    fetchSzse(limit),
    fetchAListingHistory(HISTORY_START),
    fetchHkex(previousSnapshot),
    fetchHkexListingHistory(2024),
  ]);
  const [sseResult, szseResult, aHistoryResult, hkexResult, hkHistoryResult] = results;
  const previousProjects = previousSnapshot?.projects || [];
  const previousFor = (sourceId) => previousProjects.filter((project) => project.sources?.includes(sourceId));
  const previousStats = previousSnapshot?.stats || {};
  const sse = sseResult.status === "fulfilled" ? sseResult.value : {
    projects: previousFor("sse-ipo"),
    total: previousStats.sse?.total || previousFor("sse-ipo").length,
    fetchedAt: null,
  };
  const szse = szseResult.status === "fulfilled" ? szseResult.value : {
    projects: previousFor("szse-ipo"),
    total: previousStats.szse?.total || previousFor("szse-ipo").length,
    fetchedAt: null,
  };
  const aHistory = aHistoryResult.status === "fulfilled" ? aHistoryResult.value : {
    projects: previousFor("a-ipo-history"),
    total: previousStats.aHistory?.total || previousFor("a-ipo-history").length,
    startDate: HISTORY_START,
  };
  const hkex = hkexResult.status === "fulfilled" ? hkexResult.value : {
    projects: previousFor("hkex-new"),
    updated: previousStats.hkex?.progress?.updated || "待接入",
    fetchedAt: null,
    progress: previousStats.hkex?.progress || {},
    documents: previousSnapshot?.documents || {},
    documentErrors: [],
    chineseListingFetched: false,
    chineseListingError: hkexResult.reason?.message || null,
  };
  const hkHistory = hkHistoryResult.status === "fulfilled" ? hkHistoryResult.value : {
    projects: previousFor("hkex-history"),
    total: previousStats.hkHistory?.total || previousFor("hkex-history").length,
    startYear: 2024,
  };
  const carryForwardDetail = (rows) => rows.map((row) => {
    const previous = previousProjects.find((project) => project.id === row.id && project.detailLoaded);
    if (!previous) return row;
    return {
      ...row,
      ...previous,
      stage: row.stage,
      event: row.event,
      updated: row.updated,
      sector: row.sector,
      board: row.board,
      tags: row.tags,
      raw: { ...row.raw, ...previous.raw },
    };
  });
  sse.projects = carryForwardDetail(sse.projects);
  szse.projects = carryForwardDetail(szse.projects);
  const errors = results
    .map((result, index) => result.status === "rejected" ? `${["上交所", "深交所", "A股历史", "港交所近期", "港交所年度历史"][index]}：${result.reason?.message || "请求失败"}` : null)
    .filter(Boolean);

  const previousByMarketCode = new Map(previousProjects.map((project) => [`${project.market}:${String(project.code || "")}`, project]));
  const carryBenchmark = (rows) => rows.map((row) => {
    const previous = previousByMarketCode.get(`${row.market}:${String(row.code || "")}`);
    const oldPerformance = previous?.performance || {};
    const benchmarkFields = Object.fromEntries(["benchmark", "benchmarkChange", "relativeIndexChange", "relativeIndex", "benchmarkSource"].filter((key) => oldPerformance[key] !== undefined).map((key) => [key, oldPerformance[key]]));
    return Object.keys(benchmarkFields).length ? { ...row, performance: { ...(row.performance || {}), ...benchmarkFields } } : row;
  });
  aHistory.projects = carryBenchmark(aHistory.projects);
  hkHistory.projects = carryBenchmark(hkHistory.projects);

  let hkPerformance = { projects: hkHistory.projects, cache: previousSnapshot?.marketPerformanceCache?.HK || {}, fetched: 0 };
  if (hkHistory.projects.length) {
    try {
      hkPerformance = await fetchHkListingPerformance(hkHistory.projects, previousSnapshot?.marketPerformanceCache?.HK || {});
      hkHistory.projects = hkPerformance.projects;
    } catch (error) {
      errors.push(`港股首日行情：${error.message}`);
    }
  }

  const aListingByCode = new Map(aHistory.projects.map((project) => [project.code, project]));
  for (const project of sse.projects) {
    const listing = aListingByCode.get(project.code);
    if (listing) {
      listing.sources = [...new Set([...(listing.sources || []), "sse-ipo"])];
      listing.dataQuality = "发行清单 + 上交所官方发行列表";
    } else {
      aListingByCode.set(project.code, project);
    }
  }
  const aApplications = [];
  for (const project of szse.projects) {
    const listing = project.code && project.code !== "—" ? aListingByCode.get(project.code) : null;
    if (!listing) {
      aApplications.push(project);
      continue;
    }
    listing.sources = [...new Set([...(listing.sources || []), "szse-ipo"])];
    listing.documentLinks = [...(listing.documentLinks || []), ...(project.documentLinks || [])];
    listing.raw = { ...listing.raw, auditProject: project.raw };
  }
  let aProjects = [...aListingByCode.values(), ...aApplications];

  let relativeA = { projects: aProjects, fetched: 0 };
  let relativeHK = { projects: hkHistory.projects, fetched: 0 };
  try {
    relativeA = await enrichRelativeIndexPerformance(aProjects);
    relativeHK = await enrichRelativeIndexPerformance(hkHistory.projects);
    aProjects = relativeA.projects;
    hkHistory.projects = relativeHK.projects;
    errors.push(...[...(relativeA.errors || []), ...(relativeHK.errors || [])].map((message) => `上市首日基准：${message}`));
  } catch (error) {
    errors.push(`上市首日基准：${error.message}`);
  }

  const hkRecentByCode = new Map(hkex.projects.map((project) => [String(project.code).padStart(5, "0"), project]));
  const hkHistoryCodes = new Set();
  const hkProjects = hkHistory.projects.map((project) => {
    hkHistoryCodes.add(String(project.code).padStart(5, "0"));
    const recent = hkRecentByCode.get(String(project.code).padStart(5, "0"));
    if (!recent) return project;
    return {
      ...project,
      dataQuality: recent.dataQuality,
      lens: recent.lens,
      issue: recent.issue || project.issue,
      ownership: recent.ownership,
      proceeds: recent.proceeds,
      financials: recent.financials || project.financials,
      business: recent.business || project.business,
      performance: recent.performance || project.performance,
      detailLoaded: recent.detailLoaded || project.detailLoaded,
      flags: [...new Set([...(project.flags || []), ...(recent.flags || [])])],
      sources: [...new Set([...(project.sources || []), ...(recent.sources || [])])],
      documentLinks: [...(recent.documentLinks || []), ...(project.documentLinks || [])],
      raw: { ...project.raw, ...recent.raw },
    };
  });
  for (const recent of hkex.projects) {
    if (!hkHistoryCodes.has(String(recent.code).padStart(5, "0"))) hkProjects.unshift(recent);
  }

  const projects = [...aProjects, ...hkProjects];
  const sourceTotal = aProjects.length;
  const hkexTotal = hkHistory.total;
  const sourceHealth = {
    sse: sseResult.status === "fulfilled" ? "在线" : "失败",
    szse: szseResult.status === "fulfilled" ? "在线" : "失败",
    aHistory: aHistoryResult.status === "fulfilled" ? "在线" : "失败",
    hkexNew: hkexResult.status === "fulfilled" ? "在线" : "失败",
    hkexNewZh: hkex.chineseListingFetched ? "在线" : "待重试",
    hkexProgress: hkexResult.status === "fulfilled" ? "在线" : "失败",
    hkexHistory: hkHistoryResult.status === "fulfilled" ? "在线" : "失败",
  };
  const relativeCount = relativeA.fetched + relativeHK.fetched;
  const relativeErrorCount = (relativeA.errors?.length || 0) + (relativeHK.errors?.length || 0);
  const relativeStatus = relativeCount === 0 ? "待重试" : relativeErrorCount ? "部分在线" : "在线";
  return {
    version: "0.5.0",
    snapshotAt: formatNow(),
    historyStart: HISTORY_START,
    historyEnd: new Date().toISOString().slice(0, 10),
    mode: "2024 至今全量历史 + 交易所实时进展",
    notice: errors.length ? `部分数据源刷新失败：${errors.join("；")}。失败部分保留上一份有效缓存。` : hkex.documentErrors?.length ? `年度历史清单完整，但部分近期招股书解析失败：${hkex.documentErrors.join("；")}。` : "已覆盖 2024 至今沪深发行上市、深交所审核进展及港交所主板年度新上市；更深财务、股权稀释和上市后相对表现按公司逐项补齐。",
    sources: [
      healthSource(SOURCES.sse, sourceHealth.sse, sse.fetchedAt, sseResult.status === "rejected" ? sseResult.reason?.message : null),
      healthSource(SOURCES.szse, sourceHealth.szse, szse.fetchedAt, szseResult.status === "rejected" ? szseResult.reason?.message : null),
      healthSource(SOURCES.aHistory, sourceHealth.aHistory, formatNow(), aHistoryResult.status === "rejected" ? aHistoryResult.reason?.message : null),
      healthSource(SOURCES.hkexNew, sourceHealth.hkexNew, hkex.fetchedAt, hkexResult.status === "rejected" ? hkexResult.reason?.message : null),
      healthSource(SOURCES.hkexNewZh, sourceHealth.hkexNewZh, hkex.fetchedAt, hkex.chineseListingError),
      healthSource(SOURCES.hkexProgress, sourceHealth.hkexProgress, hkex.progress?.fetchedAt, hkexResult.status === "rejected" ? hkexResult.reason?.message : null),
      healthSource(SOURCES.hkexHistory, sourceHealth.hkexHistory, formatNow(), hkHistoryResult.status === "rejected" ? hkHistoryResult.reason?.message : null),
      healthSource(SOURCES.benchmark, relativeStatus, formatNow(), relativeA.errors?.concat(relativeHK.errors || []).join("；") || null),
    ],
    dataStack: [
      { label: "上交所 IPO 发行列表", status: sourceHealth.sse },
      { label: `深交所审核进展 ${szse.projects.length}/${szse.total}`, status: sourceHealth.szse },
      { label: `沪深发行上市历史 ${aHistory.projects.length}`, status: sourceHealth.aHistory },
      { label: "港交所新上市资料", status: sourceHealth.hkexNew },
      { label: "港交所中文名称", status: sourceHealth.hkexNewZh },
      { label: `港交所年度历史 ${hkHistory.projects.length}`, status: sourceHealth.hkexHistory },
      { label: "招股书 / 公告解析", status: hkex.documentErrors?.length ? "部分失败" : hkex.documents && Object.keys(hkex.documents).length ? "在线" : "待接入" },
      { label: `港股首日行情 ${Object.values(hkPerformance.cache || {}).filter((item) => item?.firstDayClose !== null && item?.firstDayClose !== undefined).length}/${hkHistory.projects.length}`, status: "在线" },
      { label: `上市首日相对基准 ${relativeCount} 组`, status: relativeStatus },
    ],
    stats: {
      sse: { fetched: sse.projects.length, total: sse.total },
      szse: { fetched: szse.projects.length, total: szse.total },
      aHistory: { fetched: aHistory.projects.length, total: aHistory.total, startDate: aHistory.startDate },
      hkex: { fetched: hkex.projects.length, total: hkexTotal, progress: hkex.progress, documents: Object.keys(hkex.documents || {}).length, documentErrors: hkex.documentErrors || [] },
      hkHistory: { fetched: hkHistory.projects.length, total: hkHistory.total, startYear: hkHistory.startYear },
      hkMarket: { fetched: hkPerformance.fetched, cached: Object.keys(hkPerformance.cache || {}).length },
      benchmark: { fetched: relativeA.fetched + relativeHK.fetched },
      errors,
    },
    documents: hkex.documents || {},
    marketPerformanceCache: { HK: hkPerformance.cache || {} },
    markets: {
      A: {
        label: "A 股",
        sublabel: "沪深交易所",
        color: "green",
        total: aProjects.length,
        nearEvent: aProjects.filter((project) => project.recordType === "application").length,
        coverage: 100,
        review: marketReview("A 股", aProjects, sourceTotal, null),
      },
      HK: {
        label: "港股",
        sublabel: "HKEX Main Board",
        color: "amber",
        total: hkProjects.length,
        nearEvent: hkProjects.filter((project) => project.recordType === "application").length,
        coverage: 100,
        review: marketReview("港股", hkProjects, hkexTotal, hkex.progress),
      },
    },
    projects,
  };
}
