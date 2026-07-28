(() => {
  let snapshot = window.IPO_XRAY_SNAPSHOT || { projects: [], markets: {}, sources: [], dataStack: [] };
  const today = new Date().toISOString().slice(0, 10);
  const state = {
    market: "A",
    module: "overview",
    startDate: "2024-01-01",
    endDate: today,
    stage: "all",
    query: "",
    page: 1,
    pageSize: 30,
    drawerId: null,
    lastAction: "正在载入 IPO 底表…",
  };

  const app = document.querySelector("#app");
  const STATUS = [
    { key: "accepted", label: "受理 / 递表", tone: "blue" },
    { key: "inquiry", label: "问询中", tone: "cyan" },
    { key: "hearing", label: "上会 / 聆讯", tone: "purple" },
    { key: "registration", label: "注册阶段", tone: "amber" },
    { key: "offering", label: "发行 / 配发", tone: "orange" },
    { key: "listed", label: "已上市", tone: "green" },
    { key: "suspended", label: "中止", tone: "gray" },
    { key: "terminated", label: "终止", tone: "red" },
  ];
  const MODULES = [
    { id: "overview", index: "01", label: "总览" },
    { id: "events", index: "02", label: "事件研究" },
    { id: "scores", index: "03", label: "发行质量评分" },
    { id: "weekly", index: "04", label: "本周动态" },
  ];

  const esc = (value = "") => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function numeric(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function formatNumber(value, digits = 1) {
    const number = numeric(value);
    if (number === null) return "待核验";
    return number.toLocaleString("zh-CN", { maximumFractionDigits: digits });
  }

  function formatMoney(value, currency, divisor = 1) {
    const number = numeric(value);
    if (number === null) return "待核验";
    return `${currency}${formatNumber(number / divisor, 2)}`;
  }

  function isoDate(value) {
    const raw = String(value || "").trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
  }

  function statusOf(project) {
    if (project.stageKey) return project.stageKey;
    const stage = String(project.stage || "");
    if (/终止|不予注册/.test(stage)) return "terminated";
    if (/中止/.test(stage)) return "suspended";
    if (/已上市/.test(stage)) return "listed";
    if (/发行|配发/.test(stage)) return "offering";
    if (/注册/.test(stage)) return "registration";
    if (/上市委|聆讯/.test(stage)) return "hearing";
    if (/问询/.test(stage)) return "inquiry";
    return "accepted";
  }

  function toneOf(project) {
    return STATUS.find((item) => item.key === statusOf(project))?.tone || project.stageTone || "gray";
  }

  function projectDate(project) {
    return isoDate(project.date || project.updated || project.issue?.listingDate || project.raw?.LISTING_DATE);
  }

  function marketProjects() {
    return (snapshot.projects || []).filter((project) => project.market === state.market);
  }

  function filteredProjects() {
    const query = state.query.trim().toLowerCase();
    return marketProjects()
      .filter((project) => {
        const date = projectDate(project);
        if (state.startDate && date && date < state.startDate) return false;
        if (state.endDate && date && date > state.endDate) return false;
        if (state.stage !== "all" && statusOf(project) !== state.stage) return false;
        if (query) {
          const haystack = [project.name, project.code, project.board, project.sector, ...(project.tags || [])].join(" ").toLowerCase();
          if (!haystack.includes(query)) return false;
        }
        return true;
      })
      .sort((a, b) => String(projectDate(b) || "").localeCompare(String(projectDate(a) || "")));
  }

  function selectedProject() {
    return (snapshot.projects || []).find((project) => project.id === state.drawerId);
  }

  function currentMarket() {
    return snapshot.markets?.[state.market] || {
      label: state.market === "A" ? "A 股" : "港股",
      sublabel: state.market === "A" ? "沪深交易所" : "HKEX Main Board",
    };
  }

  function countByStatus(rows) {
    return Object.fromEntries(STATUS.map((status) => [
      status.key,
      rows.filter((project) => statusOf(project) === status.key).length,
    ]));
  }

  function renderHeader() {
    const aCount = (snapshot.projects || []).filter((project) => project.market === "A").length;
    const hkCount = (snapshot.projects || []).filter((project) => project.market === "HK").length;
    return `
      <header class="topbar">
        <div class="brand">
          <span class="brand-mark"><i></i><i></i><i></i></span>
          <div><strong>IPO X光机</strong><small>IPO X-RAY · A/H PRIMARY MARKET</small><em>ISSUANCE · DILUTION · QUALITY · AFTERMARKET</em></div>
        </div>
        <div class="topbar-right">
          <div class="top-meta"><span class="live-dot"></span><span>${esc(snapshot.mode || "本地快照")}</span><span>${esc(snapshot.snapshotAt || "载入中")}</span></div>
          <div class="header-panels">
            <div class="market-switch" role="tablist" aria-label="市场">
              <button class="market-button ${state.market === "A" ? "active" : ""}" data-market="A" role="tab" aria-selected="${state.market === "A"}">
                <span>A 股</span><strong>${aCount}</strong><small>沪深 · 2024 至今</small>
              </button>
              <button class="market-button ${state.market === "HK" ? "active" : ""}" data-market="HK" role="tab" aria-selected="${state.market === "HK"}">
                <span>港股</span><strong>${hkCount}</strong><small>主板 · 2024 至今</small>
              </button>
            </div>
          </div>
        </div>
      </header>`;
  }

  function renderModuleTabs() {
    return `<nav class="module-tabs" aria-label="IPO X光机模块">${MODULES.map((item) => `
      <button class="module-tab ${state.module === item.id ? "active" : ""}" data-module="${item.id}">
        <span>${item.index}</span>${item.label}
      </button>`).join("")}</nav>`;
  }

  function renderFilters() {
    return `
      <section class="filter-bar">
        <div class="date-range">
          <span class="filter-label">数据区间</span>
          <input type="date" id="start-date" min="${esc(snapshot.historyStart || "2024-01-01")}" max="${esc(state.endDate)}" value="${esc(state.startDate)}" />
          <span class="date-separator">-</span>
          <input type="date" id="end-date" min="${esc(snapshot.historyStart || "2024-01-01")}" max="${esc(snapshot.historyEnd || today)}" value="${esc(state.endDate)}" />
          <button class="preset" data-preset="2024">2024 至今</button>
          <button class="preset" data-preset="year">今年</button>
        </div>
        <div class="filter-actions">
          <select id="stage-filter" aria-label="进展筛选">
            <option value="all">全部进展</option>
            ${STATUS.map((status) => `<option value="${status.key}" ${state.stage === status.key ? "selected" : ""}>${status.label}</option>`).join("")}
          </select>
          <label class="search-box"><span>⌕</span><input id="query" value="${esc(state.query)}" placeholder="公司 / 代码 / 行业" /></label>
          <button class="refresh-button" id="refresh">刷新底表</button>
        </div>
      </section>
      <div class="coverage-note">
        <span class="live-dot"></span>
        ${esc(currentMarket().label)} · ${filteredProjects().length} 条区间记录 · 历史覆盖 ${esc(snapshot.historyStart || "2024-01-01")} 至 ${esc(snapshot.historyEnd || today)}
        <span>${esc(state.lastAction)}</span>
      </div>`;
  }

  function renderKpis(rows) {
    const counts = countByStatus(rows);
    const listed = counts.listed || 0;
    const pipeline = rows.filter((project) => project.recordType === "application" && !["listed", "terminated"].includes(statusOf(project))).length;
    const scored = rows.filter((project) => numeric(project.score?.score) !== null);
    const averageScore = scored.length ? Math.round(scored.reduce((sum, project) => sum + project.score.score, 0) / scored.length) : null;
    const funds = rows.reduce((sum, project) => {
      if (state.market === "A") return sum + (numeric(project.issue?.grossProceedsYi) || 0);
      return sum + (numeric(project.issue?.grossProceedsHkd) || 0) / 100000000;
    }, 0);
    return `<section class="kpi-grid">
      <div class="kpi"><span>区间项目</span><strong>${rows.length}</strong><small>发行上市 + 审核进展</small></div>
      <div class="kpi"><span>已上市</span><strong>${listed}</strong><small>发行上市口径</small></div>
      <div class="kpi"><span>推进中</span><strong>${pipeline}</strong><small>不含终止与已上市</small></div>
      <div class="kpi"><span>披露募资</span><strong>${funds ? formatNumber(funds, 1) : "—"}</strong><small>${state.market === "A" ? "人民币亿元" : "亿港元"}</small></div>
      <div class="kpi accent"><span>平均质量分</span><strong>${averageScore ?? "—"}</strong><small>${scored.length} 家具备评分字段</small></div>
    </section>`;
  }

  function renderLegend(rows) {
    const counts = countByStatus(rows);
    return `<section class="legend-card">
      <div><span class="eyebrow">PROGRESS LEGEND</span><h2>发行进展</h2><p>颜色表示公司当前所处的最新节点，不代表投资评级。</p></div>
      <div class="legend-list">${STATUS.map((status) => `
        <button class="legend-item ${state.stage === status.key ? "active" : ""}" data-stage="${status.key}">
          <i class="status-dot ${status.tone}"></i><span>${status.label}</span><strong>${counts[status.key] || 0}</strong>
        </button>`).join("")}</div>
    </section>`;
  }

  function scoreBadge(project) {
    const score = numeric(project.score?.score);
    if (score === null) return `<span class="score pending">待评分</span>`;
    const tone = score >= 80 ? "high" : score >= 65 ? "mid" : "low";
    return `<span class="score ${tone}">${score}</span>`;
  }

  function renderTable(rows, mode = "overview") {
    const pageCount = Math.max(1, Math.ceil(rows.length / state.pageSize));
    if (state.page > pageCount) state.page = pageCount;
    const start = (state.page - 1) * state.pageSize;
    const pageRows = rows.slice(start, start + state.pageSize);
    if (!pageRows.length) return `<div class="empty-state"><strong>当前区间没有匹配项目</strong><p>调整日期、进展或关键词后再看。</p></div>`;
    return `
      <div class="table-shell">
        <table class="ipo-table">
          <thead><tr><th>公司</th><th>行业</th><th>进展 / 事件</th><th>关键日期</th><th>${state.market === "A" ? "发行价 / PE / 募资" : "发售价 / 募资"}</th><th>首日表现</th><th>发行质量</th><th>下一步</th></tr></thead>
          <tbody>${pageRows.map((project) => {
            const issue = project.issue || {};
            const performance = project.performance || {};
            const terms = state.market === "A"
              ? `<strong>${numeric(issue.issuePrice) === null ? "发行价待接入" : `¥${formatNumber(issue.issuePrice, 2)}`}</strong><small>${numeric(issue.issueSharesWan) === null ? "发行股数待接入" : `${formatNumber(issue.issueSharesWan, 0)}万股`} · ${numeric(issue.issuePe) === null || numeric(issue.issuePe) <= 0 ? "PE待核验" : `${formatNumber(issue.issuePe, 1)}x`} · ${numeric(issue.grossProceedsYi) === null ? "募资待接入" : `募资${formatNumber(issue.grossProceedsYi, 1)}亿`}</small>`
              : `<strong>${numeric(issue.issuePrice) === null ? "发售价待接入" : `HK$${formatNumber(issue.issuePrice, 2)}`}</strong><small>${numeric(issue.issueShares) === null ? "发行股份待接入" : `${formatNumber(issue.issueShares, 0)}股`} · ${numeric(issue.grossProceedsHkd) === null ? "募资待接入" : `募资${formatMoney(issue.grossProceedsHkd, "HK$", 100000000)}亿`}</small>`;
            const firstDay = numeric(performance.firstDayClose);
            const marketCheck = firstDay === null ? (statusOf(project) === "listed" ? "首日行情未返回" : "尚未上市") : `首日 ${firstDay >= 0 ? "+" : ""}${formatNumber(firstDay, 1)}%`;
            return `<tr class="project-row" data-project-id="${esc(project.id)}" tabindex="0">
              <td><div class="company-cell"><strong>${esc(project.name)}</strong><span>${esc(project.code || "—")} · ${esc(project.board || "板块待核验")}</span></div></td>
              <td><span class="industry-cell">${esc(project.sector || "行业待核验")}</span></td>
              <td><div class="stage-cell"><span class="stage-chip"><i class="status-dot ${toneOf(project)}"></i>${esc(project.stage || "待核验")}</span><small>${esc(project.event || "节点待核验")}</small></div></td>
              <td><span class="mono">${esc(projectDate(project) || "待核验")}</span></td>
              <td><div class="terms">${terms}</div></td>
              <td><span class="market-check ${firstDay === null ? "pending" : firstDay >= 0 ? "positive" : "negative"}">${marketCheck}</span></td>
              <td>${scoreBadge(project)}</td>
              <td><span class="open-detail">${mode === "events" ? esc(project.event || "查看事件") : "打开 X 光页"} →</span></td>
            </tr>`;
          }).join("")}</tbody>
        </table>
      </div>
      <div class="pagination">
        <span>显示 ${start + 1}–${Math.min(start + state.pageSize, rows.length)} / ${rows.length}</span>
        <div><button data-page="${state.page - 1}" ${state.page <= 1 ? "disabled" : ""}>上一页</button><span>${state.page} / ${pageCount}</span><button data-page="${state.page + 1}" ${state.page >= pageCount ? "disabled" : ""}>下一页</button></div>
      </div>`;
  }

  function renderOverview(rows) {
    return `${renderKpis(rows)}${renderLegend(rows)}
      <section class="content-card">
        <div class="section-head"><div><span class="eyebrow">COMPANY UNIVERSE</span><h2>${esc(currentMarket().label)} IPO 全景</h2></div><p>点击任意公司，从右侧打开完整发行 X 光页。</p></div>
        ${renderTable(rows)}
      </section>`;
  }

  function renderEvents(rows) {
    const counts = countByStatus(rows);
    const active = rows.filter((project) => !["listed", "terminated", "suspended"].includes(statusOf(project))).slice(0, 12);
    return `
      <section class="split-grid">
        <div class="content-card">
          <div class="section-head"><div><span class="eyebrow">EVENT MAP</span><h2>事件密度</h2></div><p>按最新项目节点归类。</p></div>
          <div class="event-map">${STATUS.map((status) => {
            const value = counts[status.key] || 0;
            const max = Math.max(...Object.values(counts), 1);
            return `<div class="event-bar"><span><i class="status-dot ${status.tone}"></i>${status.label}</span><div><i class="${status.tone}" style="width:${Math.max(3, value / max * 100)}%"></i></div><strong>${value}</strong></div>`;
          }).join("")}</div>
        </div>
        <div class="content-card watch-card">
          <div class="section-head"><div><span class="eyebrow">NEXT EVENTS</span><h2>推进中项目</h2></div></div>
          <div class="watch-list">${active.length ? active.map((project) => `<button data-project-id="${esc(project.id)}"><span><i class="status-dot ${toneOf(project)}"></i><strong>${esc(project.name)}</strong></span><small>${esc(project.event || project.stage)}</small></button>`).join("") : "<p class='muted'>当前区间没有推进中项目。</p>"}</div>
        </div>
      </section>
      <section class="content-card">
        <div class="section-head"><div><span class="eyebrow">EVENT LEDGER</span><h2>事件台账</h2></div><p>日期使用上市日、更新日或递表日。</p></div>
        ${renderTable(rows, "events")}
      </section>`;
  }

  function renderScores(rows) {
    const scored = rows.filter((project) => numeric(project.score?.score) !== null)
      .sort((a, b) => b.score.score - a.score.score);
    const high = scored.filter((project) => project.score.score >= 80).length;
    const mid = scored.filter((project) => project.score.score >= 65 && project.score.score < 80).length;
    const low = scored.filter((project) => project.score.score < 65).length;
    return `
      <section class="score-method">
        <div><span class="eyebrow">ISSUE QUALITY</span><h2>发行质量评分</h2><p>定价估值、首日价格发现、发行需求与发行信息完整度。缺失项不按零分处理，同时单列置信度。</p></div>
        <div class="score-buckets"><div><span>80–100</span><strong>${high}</strong><small>结构较优</small></div><div><span>65–79</span><strong>${mid}</strong><small>中性观察</small></div><div><span>&lt;65</span><strong>${low}</strong><small>重点核验</small></div><div><span>待评分</span><strong>${rows.length - scored.length}</strong><small>字段不足</small></div></div>
      </section>
      <section class="content-card">
        <div class="section-head"><div><span class="eyebrow">RANKING</span><h2>质量评分榜</h2></div><p>${scored.length} 家达到最低评分字段覆盖。</p></div>
        ${renderTable(scored)}
      </section>`;
  }

  function renderWeekly(rows) {
    const end = new Date(`${state.endDate || today}T00:00:00`);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    const startIso = start.toISOString().slice(0, 10);
    const weekly = rows.filter((project) => {
      const date = projectDate(project);
      return date && date >= startIso && date <= state.endDate;
    });
    const listed = weekly.filter((project) => statusOf(project) === "listed");
    const pipeline = weekly.filter((project) => project.recordType === "application");
    const funds = listed.reduce((sum, project) => sum + (state.market === "A"
      ? numeric(project.issue?.grossProceedsYi) || 0
      : (numeric(project.issue?.grossProceedsHkd) || 0) / 100000000), 0);
    const review = currentMarket().review || {};
    const performanceRows = listed
      .filter((project) => numeric(project.performance?.firstDayClose) !== null)
      .sort((a, b) => numeric(b.performance.firstDayClose) - numeric(a.performance.firstDayClose));
    const avgFirstDay = performanceRows.length ? performanceRows.reduce((sum, project) => sum + numeric(project.performance.firstDayClose), 0) / performanceRows.length : null;
    const upCount = performanceRows.filter((project) => numeric(project.performance.firstDayClose) >= 0).length;
    const downCount = performanceRows.filter((project) => numeric(project.performance.firstDayClose) < 0).length;
    const reportRows = [...performanceRows.slice(0, 5), ...performanceRows.slice(-3)].filter((project, index, list) => list.findIndex((item) => item.id === project.id) === index);
    const sourceLabels = (snapshot.sources || []).filter((source) => source.market === state.market).slice(0, 4).map((source) => source.label).join("、");
    const insight = performanceRows.length
      ? `本周有 ${performanceRows.length} 家新股返回上市首日行情，${upCount} 家上涨、${downCount} 家下跌，首日收盘相对发行价平均 ${avgFirstDay >= 0 ? "+" : ""}${formatNumber(avgFirstDay, 1)}%。`
      : "本周上市后行情尚未返回，周报只呈现交易所上市清单与发行进展，不用估算值替代。";
    const bulletRows = weekly.slice(0, 8);
    return `
      <section class="weekly-report-shell">
        <div class="report-toolbar"><div><span class="eyebrow">WEEKLY / ${esc(currentMarket().label)}</span><strong>本周动态</strong><small>按交易所进展、发行清单与行情接口自动生成</small></div><div class="report-toolbar-actions"><span>生成于 ${esc(snapshot.snapshotAt || "载入中")}</span><button data-print-weekly>保存 PDF</button></div></div>
        <article class="report-paper">
          <header class="report-head">
            <span class="report-kicker">IPO X光机 · WEEKLY MARKET NOTE</span>
            <h2>本周${esc(currentMarket().label)} IPO 市场发生了什么</h2>
            <div class="report-meta">${startIso} 至 ${esc(state.endDate)}　|　IPO X光机　|　每周摘要　|　生成于 ${esc(snapshot.snapshotAt || "载入中")}</div>
          </header>
          <section class="report-section">
            <h3>一、本周要闻</h3>
            <ul class="report-bullets">${bulletRows.length ? bulletRows.map((project) => `<li><time>${esc(projectDate(project) || "日期待返回")}</time><button data-project-id="${esc(project.id)}"><strong>${esc(project.name)}</strong></button><span>${esc(project.event || project.stage || "进展节点已更新")}</span><em>${esc(project.dataQuality || "原始字段")}</em></li>`).join("") : "<li><span>当前周没有区间内项目更新。</span></li>"}</ul>
          </section>
          <section class="report-section">
            <h3>二、本周新股表现</h3>
            <div class="report-table-wrap"><table class="report-performance-table"><thead><tr><th>代码</th><th>公司</th><th>上市日</th><th>发行价</th><th>首日收盘</th><th>首日最高</th><th>规模</th></tr></thead><tbody>${reportRows.length ? reportRows.map((project) => {
              const close = numeric(project.performance?.firstDayClose);
              const high = numeric(project.performance?.firstDayHigh);
              const issue = project.issue || {};
              const scale = state.market === "A" ? (numeric(issue.grossProceedsYi) === null ? "募资待接入" : `${formatNumber(issue.grossProceedsYi, 1)}亿`) : (numeric(issue.grossProceedsHkd) === null ? "募资待接入" : formatMoney(issue.grossProceedsHkd, "HK$", 100000000));
              return `<tr data-project-id="${esc(project.id)}"><td class="mono">${esc(project.code || "-")}</td><td><button>${esc(project.name)}</button></td><td class="mono">${esc(projectDate(project) || "-")}</td><td>${state.market === "A" ? (numeric(issue.issuePrice) === null ? "-" : `¥${formatNumber(issue.issuePrice, 2)}`) : (numeric(issue.issuePrice) === null ? "-" : `HK$${formatNumber(issue.issuePrice, 2)}`)}</td><td class="${close === null ? "pending" : close >= 0 ? "up" : "down"}">${close === null ? "行情未返回" : `${close >= 0 ? "+" : ""}${formatNumber(close, 1)}%`}</td><td class="${high === null ? "pending" : high >= 0 ? "up" : "down"}">${high === null ? "-" : `${high >= 0 ? "+" : ""}${formatNumber(high, 1)}%`}</td><td>${esc(scale)}</td></tr>`;
            }).join("") : '<tr><td colspan="7">本周暂无已上市新股或首日行情。</td></tr>'}</tbody></table></div>
          </section>
          <section class="report-section">
            <h3>三、市场统计</h3>
            <div class="report-stat-grid"><div><span>新上市</span><strong>${listed.length}</strong><small>交易所上市口径</small></div><div><span>审核 / 发行更新</span><strong>${pipeline.length}</strong><small>递表、问询、聆讯及配发</small></div><div><span>披露募资</span><strong>${funds ? formatNumber(funds, 1) : "-"}</strong><small>${state.market === "A" ? "人民币亿元" : "亿港元"}</small></div><div><span>首日上涨 / 下跌</span><strong><b class="up">${upCount}</b> / <b class="down">${downCount}</b></strong><small>基于已返回首日收盘</small></div></div>
          </section>
          <section class="report-section report-conclusion">
            <h3>四、IPO X光机观察</h3>
            <p>${esc(insight)}</p><p>${esc(review.description || "本周复盘按交易所原始字段生成，不把待核验字段当成结论。")}</p>
          </section>
          <footer class="report-foot"><span>原始来源：${esc(sourceLabels || "交易所官方来源")}</span><span>上涨红色 · 下跌绿色 · 其他状态按进展颜色显示</span><span>未知字段保留明确的数据状态</span></footer>
        </article>
      </section>`;
  }

  function renderBars(rows = []) {
    if (!rows.length) return `<p class="muted">待原始文件解析。</p>`;
    return rows.map((row) => {
      const value = numeric(row.value);
      return `<div class="detail-bar"><span>${esc(row.label)}</span><div><i style="width:${value === null ? 18 : Math.min(100, Math.max(2, value))}%"></i></div><strong>${value === null ? "待拆分" : `${formatNumber(value, 1)}%`}</strong><small>${esc(row.note || "")}</small></div>`;
    }).join("");
  }

  function formatAmountRow(row) {
    const amount = numeric(row?.amount);
    if (amount === null) return "";
    if (row.unit === "亿元") return `${formatNumber(amount, 2)} 亿元`;
    if (row.unit === "港元") return `HK$${formatNumber(amount / 100000000, 2)} 亿`;
    if (row.unit === "百万港元") return `HK$${formatNumber(amount / 100, 2)} 亿`;
    if (row.unit === "百万新元") return `S$${formatNumber(amount, 1)}m`;
    if (row.unit === "万元") return `${formatNumber(amount, 1)} 万元`;
    return formatNumber(amount, 1);
  }

  function renderProceedsDetail(project) {
    const rows = project.proceeds || [];
    if (!rows.length) return `<p class="muted">待招股书募资章节解析。</p>`;
    return `<div class="proceeds-detail">${rows.map((row) => {
      const value = numeric(row.value);
      const amount = formatAmountRow(row);
      return `<div class="proceeds-row"><div class="proceeds-row-head"><strong>${esc(row.label || "募资项目待索引")}</strong><span>${value === null ? "待拆分" : `${formatNumber(value, 1)}%`}</span></div><div class="proceeds-track"><i style="width:${value === null ? 5 : Math.min(100, Math.max(3, value))}%"></i></div><p>${amount ? `${esc(amount)} · ` : ""}${esc(row.note || "需回到招股书募资章节")}</p></div>`;
    }).join("")}</div>`;
  }

  function metricValues(metric) {
    return Array.isArray(metric?.values) ? metric.values : [];
  }

  function financialValue(metric, value) {
    if (value === null || value === undefined) return "待核验";
    const label = String(metric?.label || "");
    return /率|比例|margin/i.test(label) ? `${formatNumber(value, 1)}%` : formatNumber(value, 1);
  }

  function renderFinancialTable(project) {
    const financials = project.financials || {};
    const metrics = financials.metrics || {};
    const periods = financials.periods?.length ? financials.periods : ["近一期", "前一期", "前二期"];
    const metricDefs = [
      ["营业收入", metrics.revenue],
      ["毛利", metrics.grossProfit],
      ["毛利率", metrics.grossMargin],
      ["净利润", metrics.netProfit],
      ["经营活动现金净额", metrics.operatingCash],
      ["净利率", metrics.netMargin],
      ["研发费用", metrics.rdExpense],
      ["研发投入率", metrics.rdRatio],
      ["资产总额", metrics.totalAssets],
      ["负债总额", metrics.totalLiabilities],
      ["应收账款", metrics.accountsReceivable],
      ["存货", metrics.inventory],
    ].map(([label, metric]) => ({ label, ...(metric || {}) }));
    const available = metricDefs.some((metric) => metricValues(metric).length);
    if (!available) return `<div class="financial-empty"><strong>完整财务三年表待招股书索引</strong><p>当前项目已接入发行清单与上市表现；利润表、现金流量表、资产负债表必须回到招股书原始页补齐，不能用发行清单字段替代。</p></div>`;
    return `<div class="financial-unit">单位：${esc(financials.unit || "原始财务表单位")} · 数值顺序按招股书财务表</div><div class="financial-table-wrap"><table class="financial-table"><thead><tr><th>财务指标</th>${periods.slice(0, 5).map((period) => `<th>${esc(period)}</th>`).join("")}<th>证据</th></tr></thead><tbody>${metricDefs.filter((metric) => metricValues(metric).length).map((metric) => `<tr><th>${esc(metric.label)}</th>${periods.slice(0, 5).map((_, index) => `<td>${esc(financialValue(metric, metricValues(metric)[index]))}</td>`).join("")}<td class="evidence-cell">${metric.page ? `招股书第 ${esc(metric.page)} 页` : "招股书财务表"}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function renderProfitQuality(project) {
    const financials = project.financials || {};
    const quality = [...(financials.profitQuality || [])];
    const concentration = financials.customerConcentration?.groups?.[0] || financials.customerConcentration?.value;
    const topFive = financials.topFiveCustomers?.groups?.[0] || financials.topFiveCustomers?.value;
    if (concentration !== null && concentration !== undefined) quality.push({ label: "最大客户占比", value: `${concentration}%`, note: "招股书客户集中度" });
    if (topFive !== null && topFive !== undefined) quality.push({ label: "前五大客户占比", value: `${topFive}%`, note: "招股书客户集中度" });
    return quality.length ? `<div class="quality-grid">${quality.map((item) => `<div><span>${esc(item.label || "盈利质量")}</span><strong>${esc(item.value ?? "待核验")}</strong><small>${esc(item.note || "来源待核验")}</small></div>`).join("")}</div>` : `<p class="muted">盈利质量指标待招股书索引。</p>`;
  }

  function renderBusinessDetail(project) {
    const business = project.business || {};
    const customerConcentration = business.customerConcentration?.groups?.[0] ?? business.customerConcentration?.value;
    const topFiveCustomers = business.topFiveCustomers?.groups?.[0] ?? business.topFiveCustomers?.value;
    const items = [
      ["主营业务", business.mainBusiness || project.financials?.mainBusiness || project.raw?.MAIN_BUSINESS || project.sector || "待核验"],
      ["所属行业", business.sector || project.sector || "待核验"],
      ["客户集中度", customerConcentration === null || customerConcentration === undefined ? "待核验" : `${customerConcentration}%`],
      ["前五大客户", topFiveCustomers === null || topFiveCustomers === undefined ? "待核验" : `${topFiveCustomers}%`],
    ];
    return `<div class="fact-list">${items.map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("")}</div><p class="section-note">客户、产品和区域结构只使用招股书披露；未解析到的字段保留待核验。</p>`;
  }

  function renderIssueGrid(project) {
    const issue = project.issue || {};
    const items = state.market === "A" ? [
      ["发行价", numeric(issue.issuePrice) === null ? "待接入" : `¥${formatNumber(issue.issuePrice, 2)}`],
      ["发行股数", numeric(issue.issueSharesWan) === null ? "待接入" : `${formatNumber(issue.issueSharesWan, 0)} 万股`],
      ["发行 PE", numeric(issue.issuePe) === null || numeric(issue.issuePe) <= 0 ? "待接入" : `${formatNumber(issue.issuePe, 1)}x`],
      ["行业 PE", numeric(issue.industryPe) === null || numeric(issue.industryPe) <= 0 ? "待接入" : `${formatNumber(issue.industryPe, 1)}x`],
      ["发行规模", numeric(issue.grossProceedsYi) === null ? "待接入" : `${formatNumber(issue.grossProceedsYi, 2)} 亿元`],
      ["募资净额", numeric(issue.netProceedsYi) === null ? "待接入" : `${formatNumber(issue.netProceedsYi, 2)} 亿元`],
      ["保荐机构", issue.sponsor || project.raw?.sponsor || "待原始文件"],
    ] : [
      ["发售价", numeric(issue.issuePrice) === null ? project.lens?.[0]?.value || "待接入" : `HK$${formatNumber(issue.issuePrice, 2)}`],
      ["发行股份", numeric(issue.issueShares) === null ? "待接入" : `${formatNumber(issue.issueShares, 0)} 股`],
      ["募资规模", numeric(issue.grossProceedsHkd) === null ? project.lens?.[1]?.value || "待接入" : formatMoney(issue.grossProceedsHkd, "HK$")],
      ["招股书日", issue.prospectusDate || "官方文件未索引"],
      ["上市日", issue.listingDate || projectDate(project) || "官方文件未索引"],
      ["保荐人", issue.sponsor || "官方文件未索引"],
    ];
    return `<div class="detail-metric-grid">${items.map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("")}</div>`;
  }

  function renderScoreDetail(project) {
    const score = numeric(project.score?.score);
    const dimensions = project.score?.dimensions || [];
    return `<div class="score-detail">
      <div class="score-ring ${score === null ? "pending" : ""}"><strong>${score ?? "—"}</strong><span>质量分</span></div>
      <div class="dimension-list">${dimensions.length ? dimensions.map((item) => `<div><span>${esc(item.label)}</span><div><i style="width:${item.value}%"></i></div><strong>${item.value}</strong></div>`).join("") : "<p class='muted'>财务、配售或上市后字段尚不足，暂不强行评分。</p>"}</div>
      <small>字段置信度 ${formatNumber(project.score?.confidence || 0, 0)}%</small>
    </div>`;
  }

  function renderDocuments(project) {
    const sourceLinks = (project.sources || []).map((id) => snapshot.sources?.find((source) => source.id === id)).filter(Boolean);
    const documents = [...(project.documentLinks || []), ...sourceLinks.map((source) => ({ label: source.label, kind: source.kind, url: source.url }))];
    const unique = [...new Map(documents.filter((item) => item?.url).map((item) => [item.url, item])).values()];
    return unique.length ? unique.map((item) => `<a href="${esc(item.url)}" target="_blank" rel="noreferrer"><span>${esc(item.label)}</span><small>${esc(item.kind || "原始文件")} ↗</small></a>`).join("") : `<p class="muted">原始文件入口待接入。</p>`;
  }

  function renderDrawer() {
    const project = selectedProject();
    if (!project) return "";
    const financials = project.financials || {};
    const performance = project.performance || {};
    const listed = statusOf(project) === "listed";
    const financialItems = [
      ["主营业务", financials.mainBusiness || project.sector || "官方字段未返回"],
      ["盈利状态", financials.profitable === null || financials.profitable === undefined ? "待招股书字段" : financials.profitable ? "已盈利" : "未盈利"],
      ["每股净资产", numeric(financials.bvps) === null ? "待发行清单" : formatNumber(financials.bvps, 2)],
      ["财务表覆盖", financials.metrics && Object.values(financials.metrics).some((metric) => metric?.values?.length) ? "利润表 / 现金流已解析" : "完整三表待招股书索引"],
    ];
    const performanceItems = [
      ["首日开盘", numeric(performance.firstDayOpen) === null ? (listed ? "行情未返回" : "尚未上市") : `${formatNumber(performance.firstDayOpen, 1)}%`],
      ["首日收盘", numeric(performance.firstDayClose) === null ? (listed ? "行情未返回" : "尚未上市") : `${formatNumber(performance.firstDayClose, 1)}%`],
      ["首日最高", numeric(performance.firstDayHigh) === null ? (listed ? "行情未返回" : "尚未上市") : `${formatNumber(performance.firstDayHigh, 1)}%`],
      ["相对指数 / 行业", performance.relativeIndex || "基准序列待接入"],
    ];
    return `
      <div class="drawer-scrim" data-close-drawer></div>
      <aside class="detail-drawer" aria-label="${esc(project.name)} IPO X 光页">
        <div class="drawer-head">
          <div><span class="eyebrow">${esc(project.market)} / ${esc(project.code || "—")} / ${esc(project.id)}</span><h2>${esc(project.name)}</h2><p>${esc(project.board || "")} · ${esc(project.sector || "")}</p></div>
          <button class="drawer-close" data-close-drawer aria-label="关闭">×</button>
        </div>
        <div class="drawer-body">
          <div class="drawer-status"><span class="stage-chip"><i class="status-dot ${toneOf(project)}"></i>${esc(project.stage)}</span><span>${esc(project.dataQuality || "字段待核验")}</span></div>
          <section class="drawer-section"><div class="drawer-title"><span>01</span><h3>发行 / 上市信息</h3></div>${renderIssueGrid(project)}<p class="section-note">${esc(project.thesis || "")}</p></section>
          <section class="drawer-section"><div class="drawer-title"><span>02</span><h3>股权结构与上市后稀释</h3></div>${renderBars(project.ownership)}</section>
          <section class="drawer-section"><div class="drawer-title"><span>03</span><h3>估值、发行价格与发行规模</h3></div>${renderScoreDetail(project)}</section>
          <section class="drawer-section"><div class="drawer-title"><span>04</span><h3>募资用途与资金投向</h3></div>${renderProceedsDetail(project)}<p class="section-note">募资项目按招股书用途章节拆分；金额、比例和页码证据分别保留，未把未知项按零处理。</p></section>
          <section class="drawer-section"><div class="drawer-title"><span>05</span><h3>财务数据与盈利质量</h3></div><div class="fact-list">${financialItems.map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("")}</div>${renderFinancialTable(project)}${renderProfitQuality(project)}</section>
          <section class="drawer-section"><div class="drawer-title"><span>06</span><h3>商业模式与客户结构</h3></div>${renderBusinessDetail(project)}</section>
          <section class="drawer-section"><div class="drawer-title"><span>07</span><h3>上市后相对指数 / 行业表现</h3></div><div class="fact-list">${performanceItems.map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("")}</div><p class="section-note">相对表现必须以真实上市日为起点；未取得完整交易序列时不使用估算值。</p></section>
          <section class="drawer-section"><div class="drawer-title"><span>08</span><h3>招股书、问询回复与配售结果</h3></div><div class="document-list">${renderDocuments(project)}</div></section>
          <section class="drawer-section"><div class="drawer-title"><span>09</span><h3>市场复盘与下一步核验</h3></div><div class="review-box"><strong>${esc(project.stage)} · ${esc(project.event || "事件待核验")}</strong><p>${statusOf(project) === "listed" ? "进入上市后验证阶段：关注首日价格发现、相对指数表现、成交结构和募投兑现。" : "仍处发行审核链条：优先跟踪下一次问询、上会、注册或发行文件，不提前把进展推断为上市结果。"}</p></div></section>
        </div>
      </aside>`;
  }

  function renderMain() {
    const rows = filteredProjects();
    const content = state.module === "events" ? renderEvents(rows)
      : state.module === "scores" ? renderScores(rows)
        : state.module === "weekly" ? renderWeekly(rows)
          : renderOverview(rows);
    app.innerHTML = `<div class="terminal-shell">${renderHeader()}${renderModuleTabs()}${renderFilters()}<main>${content}</main><footer>IPO X光机 · 独立项目 · 未连接投研体系 · 数据区间内全量展示，未知字段保留“待核验”</footer></div>${renderDrawer()}`;
    document.body.classList.toggle("drawer-open", Boolean(state.drawerId));
    bindEvents();
  }

  async function openProject(id) {
    state.drawerId = id;
    const project = (snapshot.projects || []).find((item) => item.id === id);
    const needsParse = project?.id.startsWith("A-SZSE-") && !project.detailLoaded;
    state.lastAction = needsParse ? "正在读取深交所详情与招股书…" : `已打开 ${project?.name || "项目"} X 光页`;
    renderMain();
    if (!needsParse) return;
    try {
      const response = await fetch(`/api/ipo/project/${encodeURIComponent(project.id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      snapshot.projects = snapshot.projects.map((item) => item.id === payload.project.id ? payload.project : item);
      state.lastAction = "招股书与原始文件已按需解析";
    } catch (error) {
      state.lastAction = `原始文件解析失败，保留交易所字段 · ${error.message}`;
    }
    renderMain();
  }

  function bindEvents() {
    app.querySelectorAll("[data-market]").forEach((button) => button.addEventListener("click", () => {
      state.market = button.dataset.market;
      state.stage = "all";
      state.query = "";
      state.page = 1;
      state.drawerId = null;
      state.lastAction = `已切换 ${button.dataset.market === "A" ? "A 股" : "港股"}`;
      renderMain();
    }));
    app.querySelectorAll("[data-module]").forEach((button) => button.addEventListener("click", () => {
      state.module = button.dataset.module;
      state.page = 1;
      renderMain();
    }));
    app.querySelectorAll("[data-stage]").forEach((button) => button.addEventListener("click", () => {
      state.stage = state.stage === button.dataset.stage ? "all" : button.dataset.stage;
      state.page = 1;
      renderMain();
    }));
    app.querySelectorAll("[data-project-id]").forEach((row) => {
      const open = () => openProject(row.dataset.projectId);
      row.addEventListener("click", open);
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });
    });
    app.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => {
      const page = Number(button.dataset.page);
      if (page > 0) state.page = page;
      renderMain();
    }));
    app.querySelectorAll("[data-close-drawer]").forEach((button) => button.addEventListener("click", () => {
      state.drawerId = null;
      renderMain();
    }));
    app.querySelectorAll("[data-preset]").forEach((button) => button.addEventListener("click", () => {
      state.startDate = button.dataset.preset === "year" ? `${state.endDate.slice(0, 4)}-01-01` : "2024-01-01";
      state.page = 1;
      renderMain();
    }));
    app.querySelector("#start-date")?.addEventListener("change", (event) => {
      state.startDate = event.target.value;
      state.page = 1;
      renderMain();
    });
    app.querySelector("#end-date")?.addEventListener("change", (event) => {
      state.endDate = event.target.value;
      state.page = 1;
      renderMain();
    });
    app.querySelector("#stage-filter")?.addEventListener("change", (event) => {
      state.stage = event.target.value;
      state.page = 1;
      renderMain();
    });
    app.querySelector("#query")?.addEventListener("input", (event) => {
      state.query = event.target.value;
      state.page = 1;
      renderMain();
      const input = app.querySelector("#query");
      input?.focus();
      input?.setSelectionRange(state.query.length, state.query.length);
    });
    app.querySelector("#refresh")?.addEventListener("click", refreshSnapshot);
    app.querySelector("[data-print-weekly]")?.addEventListener("click", () => window.print());
  }

  async function refreshSnapshot() {
    state.lastAction = "正在刷新 2024 至今底表与交易所进展…";
    renderMain();
    try {
      const response = await fetch("/api/ipo/refresh", { method: "POST" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      snapshot = await response.json();
      state.endDate = snapshot.historyEnd || today;
      state.lastAction = `全量底表已刷新 · ${snapshot.snapshotAt}`;
    } catch (error) {
      state.lastAction = `刷新失败，继续使用当前快照 · ${error.message}`;
    }
    renderMain();
  }

  async function loadSnapshot() {
    try {
      const response = await fetch("/api/ipo/snapshot", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      snapshot = await response.json();
      state.startDate = snapshot.historyStart || "2024-01-01";
      state.endDate = snapshot.historyEnd || today;
      state.lastAction = `已载入 ${snapshot.projects.length} 条项目记录`;
    } catch (error) {
      state.lastAction = `实时底表不可用，使用演示快照 · ${error.message}`;
    }
    renderMain();
  }

  renderMain();
  loadSnapshot();
})();
