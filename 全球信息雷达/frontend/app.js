const API = "http://127.0.0.1:8910/api";
const DOMAIN_LABELS = { macro: "宏观", geopolitics: "地缘政治", global_tech: "全球科技", industry: "行业", stock: "个股" };
const state = { route: "selected", topics: [], domains: [], sources: [], hot: [], loading: false, query: {} };

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
const formatTime = (value) => value ? new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "时间待核";
const dayKey = (item) => (item.published_at || item.discovered_at || "").slice(0, 10) || "未标注日期";
const sourceName = (sourceId) => state.sources.find((source) => source.id === sourceId)?.name || sourceId || "未知来源";
const showNotice = (message, error = false) => { const node = $("#notice"); node.textContent = message || ""; node.className = `notice${error ? " error" : ""}`; };

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, { headers: { "Content-Type": "application/json" }, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `请求失败 ${response.status}`);
  return body;
}

function setRoute(route) {
  state.route = route;
  document.querySelectorAll("[data-route]").forEach((button) => button.classList.toggle("active", button.dataset.route === route));
  const labels = { selected: ["SIGNAL / SELECTED", "精选流"], all: ["STREAM / ALL", "全部动态"], daily: ["BRIEF / DAILY", "日报"], topics: ["MAP / TOPICS", "主题地图"], favorites: ["LIBRARY / SAVED", "收藏"], sources: ["CONTROL / SOURCES", "信息源"], settings: ["CONTROL / PROCESSOR", "处理设置"] };
  $("#page-eyebrow").textContent = labels[route]?.[0] || "GLOBAL INFORMATION RADAR";
  $("#page-title").textContent = labels[route]?.[1] || "全球信息雷达";
  window.location.hash = route;
  renderRoute().catch((error) => showNotice(error.message, true));
}

async function refreshChrome() {
  const [topicData, sourceData, hotData] = await Promise.all([request("/topics"), request("/sources"), request("/hot-topics")]);
  state.topics = topicData.topics || [];
  state.domains = topicData.domains || [];
  state.sources = sourceData.sources || [];
  state.hot = hotData.items || [];
  $("#hot-topics").innerHTML = state.hot.length ? state.hot.map((topic) => `<button class="hot-topic" data-hot-topic="${escapeHtml(topic.title)}"><strong>${escapeHtml(topic.title)}</strong><em>${topic.source_count} 源</em></button>`).join("") : `<span class="muted">还没有足够的多源信号，添加来源后这里会自动出现。</span>`;
  $("#hot-topics").querySelectorAll("[data-hot-topic]").forEach((button) => button.addEventListener("click", () => { state.query.q = button.dataset.hotTopic; setRoute("all"); }));
}

function filterBar(mode) {
  const domains = state.domains.map((domain) => `<option value="${escapeHtml(domain.key)}">${escapeHtml(domain.label)}</option>`).join("");
  const topics = state.topics.map((topic) => `<option value="${escapeHtml(topic.slug)}">${escapeHtml(topic.label)}</option>`).join("");
  return `<div class="filter-bar feed-filter">
    <input class="input search" id="search-input" placeholder="搜索标题、摘要、来源…" value="${escapeHtml(state.query.q || "")}" />
    <select class="select compact" id="domain-filter"><option value="">全部领域</option>${domains}</select>
    <select class="select compact" id="topic-filter"><option value="">全部主题</option>${topics}</select>
    <select class="select compact" id="window-filter"><option value="24h">24 小时</option><option value="7d">7 天</option><option value="30d">30 天</option><option value="all">全部历史</option></select>
    <select class="select compact" id="by-filter"><option value="timeline">按发现时间</option><option value="published">按发布时间</option></select>
    <button class="button ghost" id="apply-filter">搜索</button>
  </div>`;
}

function feedTabs(mode) {
  const activeDomain = state.query.domain || "";
  const tabs = [{ key: "", label: "全部" }, ...state.domains.map((domain) => ({ key: domain.key, label: domain.label }))];
  return `<nav class="feed-tabs" aria-label="动态领域">${tabs.map((tab) => `<button class="feed-tab ${activeDomain === tab.key ? "active" : ""}" data-feed-domain="${escapeHtml(tab.key)}">${escapeHtml(tab.label)}</button>`).join("")}</nav>`;
}

function feedTime(value) {
  return value ? new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "--:--";
}

function itemCard(item) {
  const topics = (item.topics || []).slice(0, 4).map((topic) => `<span class="chip">${escapeHtml(topic)}</span>`).join("");
  const domain = `<span class="chip domain">${escapeHtml(DOMAIN_LABELS[item.domain] || item.domain)}</span>`;
  const timestamp = item.published_at || item.discovered_at;
  const displaySummary = item.summary || "暂无摘要，点击查看原文";
  return `<article class="timeline-entry" data-item-id="${escapeHtml(item.id)}">
    <div class="timeline-time"><strong>${escapeHtml(feedTime(timestamp))}</strong><span>${item.published_at ? "原文时间" : "发现时间"}</span></div>
    <span class="timeline-dot" aria-hidden="true"></span>
    <div class="item-card">
      <div class="item-meta"><span class="source">${escapeHtml(item.source)}</span><span>${escapeHtml(DOMAIN_LABELS[item.domain] || item.domain)}</span><span>公开信息</span></div>
      <h3 class="item-title" data-open-item="${escapeHtml(item.id)}">${escapeHtml(item.title)}</h3>
      <p class="item-summary">${escapeHtml(displaySummary)}</p>
      <div class="item-footer"><div class="chips">${domain}${topics}<span class="chip">规则 ${Math.round(item.score || 0)}</span></div><div class="item-actions">${item.original_url ? `<a class="item-source-link" href="${escapeHtml(item.original_url)}" target="_blank" rel="noreferrer">打开原文 ↗</a>` : ""}<button class="favorite ${item.is_favorite ? "active" : ""}" data-favorite="${escapeHtml(item.id)}" title="收藏">${item.is_favorite ? "★" : "☆"}</button></div></div>
    </div>
  </article>`;
}

function wireItems() {
  document.querySelectorAll("[data-open-item]").forEach((node) => node.addEventListener("click", () => openItem(node.dataset.openItem)));
  document.querySelectorAll("[data-favorite]").forEach((node) => node.addEventListener("click", async (event) => { event.stopPropagation(); try { await request(`/items/${node.dataset.favorite}/favorite`, { method: "POST", body: JSON.stringify({ favorite: !node.classList.contains("active") }) }); await renderRoute(); } catch (error) { showNotice(error.message, true); } }));
}

async function renderItems(mode = "selected") {
  const params = new URLSearchParams({ mode, window: state.query.window || (mode === "selected" ? "7d" : "24h"), by: state.query.by || "timeline", limit: "40" });
  for (const key of ["q", "domain", "topic"]) if (state.query[key]) params.set(key, state.query[key]);
  const data = await request(`/items?${params}`);
  const items = data.items || [];
  const groups = {};
  items.forEach((item) => (groups[dayKey(item)] ||= []).push(item));
  const title = mode === "selected" ? "精选流" : mode === "favorites" ? "已保存的信号" : "全部动态";
  const subtitle = mode === "selected" ? "按时效、来源优先级和多源覆盖度整理的本地信号" : `${new Date().toLocaleDateString("zh-CN")} · 全球信息全量信息流`;
  const body = Object.entries(groups).map(([day, values]) => `<section class="timeline-day"><div class="day-label"><strong>${escapeHtml(day)}</strong><span>${values.length} 条</span></div><div class="timeline-list">${values.map(itemCard).join("")}</div></section>`).join("");
  $("#view").innerHTML = `<div class="feed-head"><div><div class="feed-kicker">${mode === "selected" ? "SIGNAL / SELECTED" : "STREAM / ALL"}</div><h2>${title}</h2><p>${escapeHtml(subtitle)} · ${data.page.count} 条${data.page.has_more ? " · 继续下滑加载更多" : ""}</p></div><button class="button ghost" id="feed-refresh">↻ 立即刷新</button></div>${feedTabs(mode)}${filterBar(mode)}<div class="timeline">${body || `<div class="empty"><strong>${mode === "selected" ? "精选流还在等信号" : "没有匹配的动态"}</strong><span>先添加并启用一个 RSS 或 JSON API 信息源。</span></div>`}</div>`;
  $("#feed-refresh").addEventListener("click", () => startRefresh());
  document.querySelectorAll("[data-feed-domain]").forEach((node) => node.addEventListener("click", () => { state.query.domain = node.dataset.feedDomain; renderRoute(); }));
  const domainFilter = $("#domain-filter"); const topicFilter = $("#topic-filter"); const windowFilter = $("#window-filter"); const byFilter = $("#by-filter");
  if (domainFilter) domainFilter.value = state.query.domain || "";
  if (topicFilter) topicFilter.value = state.query.topic || "";
  if (windowFilter) windowFilter.value = state.query.window || (mode === "selected" ? "7d" : "24h");
  if (byFilter) byFilter.value = state.query.by || "timeline";
  $("#apply-filter").addEventListener("click", () => { state.query.q = $("#search-input").value.trim(); state.query.domain = domainFilter.value; state.query.topic = topicFilter.value; state.query.window = windowFilter.value; state.query.by = byFilter.value; renderRoute(); });
  $("#search-input").addEventListener("keydown", (event) => { if (event.key === "Enter") $("#apply-filter").click(); });
  wireItems();
}

async function openItem(itemId) {
  const data = await request(`/items/${encodeURIComponent(itemId)}`);
  const item = data.item;
  const detailSummary = escapeHtml(item.summary || "暂无摘要");
  $("#view").innerHTML = `<div class="detail"><button class="back" id="back-button">← 返回信息流</button><h2>${escapeHtml(item.title)}</h2><div class="detail-meta"><span class="source">${escapeHtml(item.source)}</span><span>${escapeHtml(DOMAIN_LABELS[item.domain] || item.domain)}</span><span>原文：${escapeHtml(formatTime(item.published_at))}</span><span>发现：${escapeHtml(formatTime(item.discovered_at))}</span><span>处理：${escapeHtml(item.generated_by || "规则")}</span></div><div class="chips" style="margin-top:16px">${(item.topics || []).map((topic) => `<span class="chip">${escapeHtml(topic)}</span>`).join("")}</div><div class="detail-summary">${detailSummary}</div><div class="detail-body">${escapeHtml(item.content_text || "本地仅保留摘要和索引，不自动抓取第三方全文。")}</div><div class="detail-actions">${item.original_url ? `<a class="button primary" href="${escapeHtml(item.original_url)}" target="_blank" rel="noreferrer">阅读原文 ↗</a>` : ""}<button class="button ghost" id="detail-favorite">${item.is_favorite ? "取消收藏" : "收藏"}</button></div></div>`;
  $("#back-button").addEventListener("click", () => setRoute(state.route));
  $("#detail-favorite").addEventListener("click", async () => { await request(`/items/${item.id}/favorite`, { method: "POST", body: JSON.stringify({ favorite: !item.is_favorite }) }); openItem(item.id); });
}

async function renderDaily() {
  const data = await request("/daily/latest");
  const report = data.report || {};
  $("#view").innerHTML = `<div class="view-head"><div><h2>${escapeHtml(report.date || "今日日报")}</h2><p>${report.mode === "ai" ? "可选模型导语 · " : "事实型日报 · "}生成于 ${escapeHtml(formatTime(report.generated_at))}</p></div></div>${report.lead ? `<section class="daily-lead"><h2>${escapeHtml(report.lead.title)}</h2><p>${escapeHtml(report.lead.paragraph)}</p></section>` : ""}${(report.sections || []).map((section) => `<section class="daily-section"><h3>${escapeHtml(section.label)} <small>${section.items.length} 条</small></h3>${section.items.map((item) => `<div class="daily-row"><strong data-open-item="${escapeHtml(item.item_id)}">${escapeHtml(item.title)}</strong><p>${escapeHtml(item.summary || "")}</p><small>${escapeHtml(item.source || "")} · ${escapeHtml(formatTime(item.published_at))}</small></div>`).join("")}</section>`).join("") || `<div class="empty"><strong>今天还没有日报内容</strong><span>刷新信息源后会自动生成事实型日报。</span></div>`}`;
  document.querySelectorAll("[data-open-item]").forEach((node) => node.addEventListener("click", () => openItem(node.dataset.openItem)));
}

async function renderTopics() {
  const counts = {};
  state.topics.forEach((topic) => (counts[topic.domain] ||= []).push(topic));
  $("#view").innerHTML = `<div class="view-head"><div><h2>主题地图</h2><p>六个模块之上，主题可以随着你的信息源配置持续生长。</p></div></div>${Object.entries(DOMAIN_LABELS).map(([domain, label]) => `<section style="margin-bottom:26px"><div class="day-label">${label}</div><div class="topic-grid">${(counts[domain] || []).map((topic) => `<article class="topic-card" data-topic="${escapeHtml(topic.slug)}"><h3>${escapeHtml(topic.label)}</h3><span class="topic-count">${topic.item_count || 0} 条本地索引</span></article>`).join("") || `<div class="empty">还没有自定义主题</div>`}</div></section>`).join("")}`;
  document.querySelectorAll("[data-topic]").forEach((node) => node.addEventListener("click", () => { state.query.topic = node.dataset.topic; setRoute("all"); }));
}

function sourceForm(source = {}) {
  const mapping = source.mapping || { items_path: "items", id: "id", title: "title", url: "url", summary: "summary", published_at: "published_at", author: "author" };
  return `<form class="source-form" id="source-form" data-source-id="${escapeHtml(source.id || "")}"><div class="form-grid"><div class="field"><label>名称</label><input class="input" name="name" required value="${escapeHtml(source.name || "")}" placeholder="例如：央行新闻" /></div><div class="field"><label>类型</label><select class="select" name="type"><option value="rss" ${source.type !== "json_api" ? "selected" : ""}>RSS / Atom</option><option value="json_api" ${source.type === "json_api" ? "selected" : ""}>JSON API</option></select></div><div class="field full"><label>端点 URL</label><input class="input" name="endpoint" required value="${escapeHtml(source.endpoint || "")}" placeholder="https://…" /></div><div class="field"><label>一级领域</label><select class="select" name="domain">${state.domains.map((domain) => `<option value="${domain.key}" ${source.domain === domain.key ? "selected" : ""}>${domain.label}</option>`).join("")}</select></div><div class="field"><label>主题（逗号分隔）</label><input class="input" name="topics" value="${escapeHtml((source.topics || []).join(","))}" placeholder="半导体, 出口管制" /></div><div class="field"><label>轮询秒数</label><input class="input" name="poll_interval_sec" type="number" min="60" value="${source.poll_interval_sec || 900}" /></div><div class="field"><label>来源优先级 0-100</label><input class="input" name="priority" type="number" min="0" max="100" value="${source.priority ?? 50}" /></div><div class="field full"><label>JSON 字段映射（点路径，RSS 不需要）</label><textarea name="mapping">${escapeHtml(JSON.stringify(mapping, null, 2))}</textarea></div></div><label class="checkbox"><input name="enabled" type="checkbox" ${source.enabled === false ? "" : "checked"} />启用此信息源</label><div class="form-actions"><button class="button primary" type="submit">${source.id ? "保存信息源" : "添加信息源"}</button><button class="button ghost" type="button" id="cancel-source">取消</button></div></form>`;
}

async function renderSources() {
  const sourceCard = (source) => `<article class="source-card"><span class="source-status ${source.state?.status === "error" ? "error" : ""}">● ${source.state?.status === "ok" ? "正常" : source.state?.status === "error" ? "异常" : "未抓取"}</span><h3>${escapeHtml(source.name)}</h3><p>${escapeHtml(source.endpoint)}</p><p>${source.type === "json_api" ? "JSON API" : "RSS/Atom"} · ${source.enabled ? "已启用" : "已停用"}</p>${source.state?.last_error ? `<p class="source-error">${escapeHtml(source.state.last_error)}</p>` : ""}<div class="source-actions"><button class="small-button" data-test-source="${escapeHtml(source.id)}">测试</button><button class="small-button" data-edit-source="${escapeHtml(source.id)}">编辑</button><button class="small-button" data-refresh-source="${escapeHtml(source.id)}">刷新</button></div></article>`;
  const sourceModules = Object.entries(DOMAIN_LABELS).map(([domain, label]) => {
    const values = state.sources.filter((source) => source.domain === domain);
    const errors = values.filter((value) => value.state?.status === "error").length;
    const activeCount = values.filter((value) => value.enabled).length;
    const body = `<div class="source-grid">${values.map(sourceCard).join("") || `<div class="module-empty">这个模块还没有配置来源</div>`}</div>`;
    return `<section class="source-module domain-${domain}"><div class="source-module-head"><div><div class="module-kicker">MODULE / ${domain.replace("_", " ").toUpperCase()}</div><h3>${label}</h3><p>${values.length} 个来源 · ${activeCount} 个启用</p></div><div class="module-head-actions"><span class="module-health ${errors ? "error" : "ok"}">${errors ? `${errors} 个异常` : "运行正常"}</span></div></div>${body}</section>`;
  }).join("");
  $("#view").innerHTML = `<div class="view-head"><div><h2>信息源</h2><p>${state.sources.length} 个 RSS/JSON 来源，按五个模块分区管理。</p></div><div class="top-actions"><button class="button ghost" id="export-sources">导出 JSON/YAML</button><button class="button primary" id="add-source">＋ 添加来源</button></div></div><div id="source-editor"></div><div class="source-modules">${sourceModules}</div><div class="settings-card" style="margin-top:18px"><h3 style="margin-top:0">配置导入</h3><p class="hint">RSS/JSON 来源可从这里导入。</p><textarea id="source-import-text" placeholder="粘贴 sources.json"></textarea><button class="button ghost" id="import-sources" style="margin-top:10px">导入配置</button></div>`;
  $("#add-source").addEventListener("click", () => { $("#source-editor").innerHTML = sourceForm(); wireSourceForm(); });
  $("#export-sources").addEventListener("click", async () => { try { const data = await request("/sources/export?format=json"); const blob = new Blob([data.content], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "global-information-radar-sources.json"; link.click(); URL.revokeObjectURL(link.href); showNotice("信息源配置已导出"); } catch (error) { showNotice(error.message, true); } });
  $("#import-sources").addEventListener("click", async () => { try { const payload = JSON.parse($("#source-import-text").value || "{}"); await request("/sources/import", { method: "POST", body: JSON.stringify(payload) }); showNotice("信息源配置已导入"); await refreshChrome(); renderSources(); } catch (error) { showNotice(error.message, true); } });
  document.querySelectorAll("[data-edit-source]").forEach((node) => node.addEventListener("click", () => { $("#source-editor").innerHTML = sourceForm(state.sources.find((source) => source.id === node.dataset.editSource)); wireSourceForm(); }));
  document.querySelectorAll("[data-test-source]").forEach((node) => node.addEventListener("click", async () => { try { showNotice("正在测试信息源…"); const result = await request(`/sources/${node.dataset.testSource}/test`, { method: "POST", body: "{}" }); showNotice(`测试成功：${result.result.count} 条可解析条目`); } catch (error) { showNotice(error.message, true); } }));
  document.querySelectorAll("[data-refresh-source]").forEach((node) => node.addEventListener("click", async () => { await startRefresh([node.dataset.refreshSource]); }));
}

function wireSourceForm() {
  $("#cancel-source").addEventListener("click", renderSources);
  $("#source-form").addEventListener("submit", async (event) => { event.preventDefault(); const form = new FormData(event.target); let mapping = {}; try { mapping = JSON.parse(form.get("mapping") || "{}"); } catch { showNotice("JSON 字段映射格式不正确", true); return; } const source = { name: form.get("name"), type: form.get("type"), endpoint: form.get("endpoint"), domain: form.get("domain"), topics: String(form.get("topics") || "").split(",").map((value) => value.trim()).filter(Boolean), poll_interval_sec: Number(form.get("poll_interval_sec")), priority: Number(form.get("priority")), enabled: form.get("enabled") === "on", mapping }; const sourceId = event.target.dataset.sourceId; try { await request(sourceId ? `/sources/${sourceId}` : "/sources", { method: sourceId ? "PUT" : "POST", body: JSON.stringify(source) }); showNotice("信息源已保存"); await refreshChrome(); renderSources(); } catch (error) { showNotice(error.message, true); } });
}

async function renderSettings() {
  const data = await request("/settings/processor"); const settings = data.settings || {};
  $("#view").innerHTML = `<section class="settings-card"><h2>处理设置</h2><p class="hint">抓取、入库、搜索和事实型日报不依赖 AI。配置 OpenAI-compatible 接口后，才会启用摘要、标签和可追溯的模型精选。密钥只从环境变量 <code>RADAR_LLM_API_KEY</code> 读取。</p><form id="settings-form" class="source-form" style="padding:0;border:0;background:transparent"><label class="checkbox"><input name="enabled" type="checkbox" ${settings.processor_enabled ? "checked" : ""} />启用可选 LLM 处理</label><div class="field"><label>Base URL（可填完整 /chat/completions）</label><input class="input" name="base_url" value="${escapeHtml(settings.llm_base_url || "")}" placeholder="https://…/v1" /></div><div class="field"><label>模型名</label><input class="input" name="model" value="${escapeHtml(settings.llm_model || "")}" placeholder="例如：gpt-4o-mini" /></div><button class="button primary" type="submit">保存设置</button></form></section>`;
  $("#settings-form").addEventListener("submit", async (event) => { event.preventDefault(); const form = new FormData(event.target); try { await request("/settings/processor", { method: "PUT", body: JSON.stringify({ processor_enabled: form.get("enabled") === "on", llm_base_url: form.get("base_url"), llm_model: form.get("model") }) }); showNotice("处理设置已保存"); } catch (error) { showNotice(error.message, true); } });
}

async function renderRoute() {
  if (state.loading) return; state.loading = true; $("#view").innerHTML = `<div class="loading">正在读取本地信号…</div>`;
  const feedRoute = ["selected", "all", "favorites"].includes(state.route);
  document.body.classList.toggle("feed-route", feedRoute);
  try {
    await refreshChrome();
    if (state.route === "selected") await renderItems("selected");
    else if (state.route === "all") await renderItems("all");
    else if (state.route === "favorites") await renderItems("favorites");
    else if (state.route === "daily") await renderDaily();
    else if (state.route === "topics") await renderTopics();
    else if (state.route === "sources") await renderSources();
    else if (state.route === "settings") await renderSettings();
  } finally { state.loading = false; }
}

async function startRefresh(sourceIds = null) {
  try { const data = await request("/refresh", { method: "POST", body: JSON.stringify({ source_ids: sourceIds, force: true }) }); showNotice("刷新任务已启动…"); const jobId = data.job.id; const poll = async () => { const current = await request(`/refresh/${jobId}`); if (["completed", "error"].includes(current.job.status)) { showNotice(`刷新完成：${current.job.results.filter((item) => item.status === "ok").length} 个来源成功`); await renderRoute(); } else setTimeout(poll, 700); }; setTimeout(poll, 500); } catch (error) { showNotice(error.message, true); }
}

async function checkHealth() { try { await request("/health"); $("#health-dot").className = "ok"; $("#health-label").textContent = "本地服务正常"; } catch { $("#health-dot").className = "bad"; $("#health-label").textContent = "API 未启动"; } }

document.querySelectorAll("[data-route]").forEach((button) => button.addEventListener("click", () => setRoute(button.dataset.route)));
$("#refresh-button").addEventListener("click", () => startRefresh());
setInterval(() => { $("#clock").textContent = new Date().toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }); }, 1000);
checkHealth();
const initial = window.location.hash.replace("#", "");
setRoute(["selected", "all", "daily", "topics", "favorites", "sources", "settings"].includes(initial) ? initial : "selected");
