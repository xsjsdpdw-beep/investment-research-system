(() => {
  const snapshot = window.IPO_XRAY_SNAPSHOT;
  const state = {
    market: "HK",
    selectedId: "HK-3308",
    stage: "all",
    query: "",
    view: "pool",
    lastAction: "独立终端已就绪",
  };

  const app = document.querySelector("#app");
  const esc = (value = "") => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  const allProjects = () => snapshot.projects;
  const market = () => snapshot.markets[state.market];
  const projects = () => allProjects().filter((project) => project.market === state.market);
  const filteredProjects = () => projects().filter((project) => {
    const query = state.query.trim().toLowerCase();
    const matchesQuery = !query || [project.code, project.name, project.sector, ...project.tags]
      .join(" ").toLowerCase().includes(query);
    const matchesStage = state.stage === "all" || project.stageTone === state.stage;
    return matchesQuery && matchesStage;
  });
  const selectedProject = () => allProjects().find((project) => project.id === state.selectedId)
    || filteredProjects()[0] || projects()[0];
  const sourceById = (id) => snapshot.sources.find((source) => source.id === id);
  const dataStack = [
    { label: "交易所公开入口", status: "官方" },
    { label: "招股书 / 公告", status: "待解析" },
    { label: "行情 / 配售结果", status: "待接入" },
  ];

  function lensValue(value) {
    return value === null || value === undefined ? "—" : esc(value);
  }

  function renderTerminalNav() {
    const navItems = [
      { id: "watchlist", index: "01", label: "自选股复盘", note: "视频里的主工作台" },
      { id: "news", index: "02", label: "新闻与公告", note: "专业数据源入口" },
      { id: "ipo", index: "03", label: "IPO X 光机", note: "当前独立实现" },
      { id: "review", index: "04", label: "市场复盘", note: "自动生成报告" },
    ];
    return navItems.map((item) => {
      const active = item.id === "ipo" || (item.id === "review" && state.view === "review");
      const action = item.id === "review" ? `data-view="review"` : `data-placeholder="${esc(item.id)}"`;
      return `
      <button class="terminal-nav ${active ? "active" : ""}" ${action} aria-label="${esc(item.label)}">
        <span class="nav-index">${item.index}</span><span class="nav-copy"><strong>${esc(item.label)}</strong><small>${esc(item.note)}</small></span>${item.id === "ipo" ? '<span class="nav-live">LIVE</span>' : ""}
      </button>`;
    }).join("");
  }

  function renderKpis() {
    const current = market();
    const aCount = allProjects().filter((project) => project.market === "A").length;
    const hkCount = allProjects().filter((project) => project.market === "HK").length;
    return `
      <div class="signal-strip" aria-label="终端摘要">
        <div class="signal"><span class="signal-label">项目池</span><strong>${allProjects().length}</strong><small>A ${aCount} / HK ${hkCount}</small></div>
        <div class="signal"><span class="signal-label">当前市场</span><strong>${esc(current.label)}</strong><small>${esc(current.sublabel)}</small></div>
        <div class="signal"><span class="signal-label">近事件</span><strong>${current.nearEvent}</strong><small>节点需要核验</small></div>
        <div class="signal"><span class="signal-label">证据覆盖</span><strong>${current.coverage}%</strong><small>${esc(snapshot.mode)}</small></div>
      </div>`;
  }

  function renderProjectRows() {
    const rows = filteredProjects();
    if (!rows.length) {
      return `<tr><td colspan="5"><div class="empty"><strong>没有匹配的项目节点</strong><p>清空搜索，或切换 A 股 / 港股。当前原型不会用虚构数据填充空白。</p></div></td></tr>`;
    }
    return rows.map((project) => `
      <tr class="project-row ${selectedProject()?.id === project.id ? "selected" : ""}" data-project-id="${esc(project.id)}" tabindex="0" role="button" aria-label="打开 ${esc(project.name)}">
        <td><div class="project-name"><strong>${esc(project.name)}</strong><span>${esc(project.sector)} · ${esc(project.dataQuality)}</span></div></td>
        <td><span class="code">${esc(project.code)}</span></td>
        <td><div class="stage"><span class="stage-dot ${esc(project.stageTone)}"></span><span class="stage-label">${esc(project.stage)}<small>${esc(project.updated)}</small></span></div></td>
        <td><span class="event">${esc(project.event)}</span></td>
        <td><div class="tag-row">${project.tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join("")}</div></td>
      </tr>`).join("");
  }

  function renderTimeline(project) {
    return `<div class="timeline" aria-label="项目阶段">${project.stagePath.map((step) => `
      <div class="timeline-step ${esc(step.state)}"><span class="timeline-node"></span><span>${esc(step.label)}</span></div>`).join("")}</div>`;
  }

  function renderBars(rows) {
    return rows.map((row) => {
      const hasValue = typeof row.value === "number";
      const width = hasValue ? Math.max(3, Math.min(100, row.value)) : 24;
      return `<div class="bar-row"><span>${esc(row.label)}</span><span class="bar-track"><span class="${hasValue ? "bar-fill" : "bar-empty"}" style="width:${width}%"></span></span><span class="bar-value">${hasValue ? `${row.value}%` : "待接入"}</span></div>`;
    }).join("");
  }

  function renderDetail(project) {
    if (!project) return `<section class="panel panel-dark detail"><div class="empty"><strong>选择一个项目</strong><p>项目详情会在这里展开。</p></div></section>`;
    const sourceLinks = project.sources.map(sourceById).filter(Boolean);
    return `
      <section class="panel panel-dark detail" aria-live="polite">
        <div class="panel-head detail-head">
          <div><div class="section-kicker">03 / Project X-ray / ${esc(project.id)}</div><div class="detail-title"><h2>${esc(project.name)}</h2><span class="market-chip">${esc(project.board)}</span></div></div>
          <div class="head-aside">${esc(project.updated)}<br /><span class="detail-status">${esc(project.stage)}</span></div>
        </div>
        <div class="detail-body">
          <div class="detail-meta"><span>${esc(project.code)} · ${esc(project.sector)}</span><span class="data-flag">${esc(project.dataQuality)}</span></div>
          <p class="detail-thesis">${esc(project.thesis)}</p>
          ${renderTimeline(project)}
          <div class="section-kicker">Issue lens / 发行 X 光</div>
          <div class="lens-grid">${project.lens.map((item) => `<div class="lens-card"><div class="lens-label">${esc(item.label)}</div><div class="lens-value">${lensValue(item.value)}</div><div class="lens-note">${esc(item.note)}</div></div>`).join("")}</div>
          <div class="subsection"><div class="subsection-head"><span class="subsection-title">Ownership / 股权结构</span><span class="subsection-note">占比字段待核验</span></div>${renderBars(project.ownership)}</div>
          <div class="subsection"><div class="subsection-head"><span class="subsection-title">Proceeds / 募资用途</span><span class="subsection-note">用途字段待核验</span></div>${renderBars(project.proceeds)}</div>
          <div class="flags">${project.flags.map((flag) => `<span class="flag">${esc(flag)}</span>`).join("")}</div>
          <div class="source-ledger"><div class="subsection-head"><span class="subsection-title">Source ledger / 来源台账</span><span class="subsection-note">官方入口</span></div><div class="source-links">${sourceLinks.map((source) => `<a class="source-link" href="${esc(source.url)}" target="_blank" rel="noreferrer"><span>${esc(source.label)}</span><span>${esc(source.kind)} ↗</span></a>`).join("")}</div></div>
        </div>
      </section>`;
  }

  function renderMarketRail(current) {
    return `
      <div class="pool-toolbar">
        <div class="market-tabs" role="tablist" aria-label="市场切换">
          <button class="market-tab ${state.market === "A" ? "active" : ""}" data-market="A" role="tab" aria-selected="${state.market === "A"}"><span>A 股</span><strong>${allProjects().filter((project) => project.market === "A").length}</strong><small>沪深交易所</small></button>
          <button class="market-tab ${state.market === "HK" ? "active" : ""}" data-market="HK" role="tab" aria-selected="${state.market === "HK"}"><span>港股</span><strong>${allProjects().filter((project) => project.market === "HK").length}</strong><small>HKEX Main Board</small></button>
        </div>
        <div class="pool-controls"><input id="search" class="search" value="${esc(state.query)}" placeholder="搜索项目、代码或行业" aria-label="搜索项目" /><select id="stage" class="control" aria-label="筛选阶段"><option value="all" ${state.stage === "all" ? "selected" : ""}>全部阶段</option><option value="amber" ${state.stage === "amber" ? "selected" : ""}>交易所索引</option><option value="lime" ${state.stage === "lime" ? "selected" : ""}>审核链条</option></select><button class="refresh" id="refresh">↻ 重载快照</button></div>
      </div>
      <div class="filter-note"><span class="filter-live"></span>${esc(current.label)} · ${esc(current.sublabel)} · ${filteredProjects().length} / ${projects().length} 个项目节点 <span class="filter-divider">|</span>${esc(state.lastAction)}</div>`;
  }

  function renderPool(current) {
    return `
      <section class="pool-layout">
        <div class="pool-column">
          <div class="panel panel-light"><div class="panel-head"><div><div class="section-kicker">IPO X-ray / Project pool</div><h2 class="panel-title">项目池</h2></div><div class="head-aside">按事件节点排序<br />选择项目查看 X 光</div></div>${renderMarketRail(current)}<div class="table-wrap"><table class="project-table"><thead><tr><th>项目</th><th>代码</th><th>阶段</th><th>下一节点</th><th>标签</th></tr></thead><tbody>${renderProjectRows()}</tbody></table></div></div>
          <div class="source-ribbon"><div><span class="section-kicker">Data stack / 专业数据源</span><strong>先接官方入口，再接结构化解析</strong></div><div class="stack-items">${dataStack.map((item) => `<span><i></i>${esc(item.label)} <small>${esc(item.status)}</small></span>`).join("")}</div></div>
        </div>
        ${renderDetail(selectedProject())}
      </section>`;
  }

  function renderReview(current) {
    const review = current.review;
    return `
      <section class="review-layout">
        <div class="review-intro panel panel-dark"><div class="section-kicker">04 / Market review / ${esc(current.label)}</div><h2>${esc(review.headline)}</h2><p>${esc(review.description)}</p><div class="review-source">输出逻辑：项目池 → 事件节点 → 公告证据 → 市场判断</div></div>
        <div class="review-metrics">${review.metrics.map((metric) => `<div class="review-metric"><span>${esc(metric.label)}</span><strong>${esc(metric.value)}</strong><small>${esc(metric.detail)}</small></div>`).join("")}</div>
        <div class="report-sheet panel panel-light"><div class="sheet-head"><div><span class="section-kicker">Auto summary / 自动复盘</span><h3>${esc(current.label)} IPO 市场复盘</h3></div><span class="sheet-date">${esc(snapshot.snapshotAt)}</span></div><div class="report-grid"><div><span class="report-label">先看</span><strong>发行进度是否兑现</strong><p>从受理、问询、招股书、配发结果中找下一条真正影响定价的证据。</p></div><div><span class="report-label">再看</span><strong>结构是否可解释</strong><p>发行价、流通盘、基石、募资用途和股权变化必须能回到原始文件。</p></div><div><span class="report-label">暂不做</span><strong>不把空值写成结论</strong><p>当前为${esc(snapshot.mode)}，未接入的数值字段会持续显示“待接入”。</p></div></div><div class="report-footer">${esc(snapshot.notice)}</div></div>
      </section>`;
  }

  function render() {
    const current = market();
    const viewTitle = state.view === "review" ? "市场复盘" : "IPO X 光机";
    app.innerHTML = `
      <div class="terminal-shell">
        <header class="topbar">
          <div class="brand"><span class="brand-mark" aria-hidden="true"><span></span></span><span class="brand-copy"><span class="brand-name">K3 / IPO X-RAY TERMINAL</span><span class="brand-sub">INDEPENDENT RESEARCH WORKBENCH</span></span></div>
          <div class="topbar-meta"><span class="pulse"></span><span>LOCAL SNAPSHOT / ${esc(snapshot.version)}</span><span>${esc(snapshot.snapshotAt)}</span><span class="topbar-user">PRIVATE WORKSPACE</span></div>
        </header>
        <nav class="workspace-nav" aria-label="终端工作区"><span class="nav-caption">WORKSPACE</span><div class="terminal-nav-list">${renderTerminalNav()}</div><span class="nav-caption nav-caption-right">K3 / DATA STACK · ${esc(snapshot.mode)}</span></nav>
        <main class="main-content">
            <section class="workspace-header"><div><div class="breadcrumbs">TERMINAL / IPO X-RAY / ${esc(current.label)}</div><h1>${viewTitle}</h1><p>把项目池、发行结构和上市后表现放在同一条证据链里。先看公告，再看判断。</p></div><div class="header-action"><span class="header-note">${esc(state.lastAction)}</span><button class="refresh" id="refresh-top">↻ 重载快照</button></div></section>
            ${renderKpis()}
            <nav class="module-tabs" aria-label="IPO 工作区"><button class="module-tab ${state.view === "pool" ? "active" : ""}" data-view="pool"><span>01</span>项目池</button><button class="module-tab ${state.view === "detail" ? "active" : ""}" data-view="detail"><span>02</span>单项目 X 光</button><button class="module-tab ${state.view === "review" ? "active" : ""}" data-view="review"><span>03</span>市场复盘</button></nav>
            ${state.view === "review" ? renderReview(current) : renderPool(current)}
        </main>
        <footer class="footer">独立项目：ipo-xray · 复刻视频中的“工作台 → IPO X 光机 → 市场复盘”结构 · ${esc(snapshot.mode)} · ${esc(snapshot.notice)}</footer>
      </div>`;
    bindEvents();
  }

  function bindEvents() {
    app.querySelectorAll("[data-market]").forEach((button) => button.addEventListener("click", () => {
      state.market = button.dataset.market;
      state.selectedId = projects()[0]?.id || null;
      state.stage = "all";
      state.query = "";
      render();
    }));
    app.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
      state.view = button.dataset.view;
      if (state.view === "detail" && !selectedProject()) state.view = "pool";
      render();
    }));
    app.querySelectorAll("[data-project-id]").forEach((row) => {
      const select = () => { state.selectedId = row.dataset.projectId; state.view = "detail"; render(); };
      row.addEventListener("click", select);
      row.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); } });
    });
    app.querySelectorAll("[data-placeholder]").forEach((button) => button.addEventListener("click", () => {
      state.lastAction = `${button.innerText.trim()}工作区已预留，当前只实现独立 IPO X-RAY；未连接投研体系。`;
      render();
    }));
    app.querySelector("#search")?.addEventListener("input", (event) => {
      state.query = event.target.value;
      render();
      const search = app.querySelector("#search");
      search.focus();
      search.setSelectionRange(state.query.length, state.query.length);
    });
    app.querySelector("#stage")?.addEventListener("change", (event) => { state.stage = event.target.value; render(); });
    app.querySelector("#refresh")?.addEventListener("click", () => { state.lastAction = "独立快照已重载"; render(); });
    app.querySelector("#refresh-top")?.addEventListener("click", () => { state.lastAction = "独立快照已重载"; render(); });
  }

  render();
})();
