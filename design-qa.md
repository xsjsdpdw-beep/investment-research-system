# Product Design QA · 全市场 ETF / 主观偏股基金

## Source visual truth

- Reference URL: `https://etf.leodwlabs.com/`
- Captured source: `/Users/leo/.codex/visualizations/2026/07/23/019f8cdd-178e-7652-8b19-b48a87e0238b/source-reference-top.png`
- Full source capture: `/Users/leo/.codex/visualizations/2026/07/23/019f8cdd-178e-7652-8b19-b48a87e0238b/source-reference-full.png`

## Implementation evidence

- Local URL: `http://localhost:5899/market-fund-allocation`
- ETF state: `/Users/leo/.codex/visualizations/2026/07/23/019f8cdd-178e-7652-8b19-b48a87e0238b/implementation-market-top-v2.png`
- 主观偏股基金 state: `/Users/leo/.codex/visualizations/2026/07/23/019f8cdd-178e-7652-8b19-b48a87e0238b/implementation-active-top-v2.png`
- Active chart/table captures: `/Users/leo/.codex/visualizations/2026/07/23/019f8cdd-178e-7652-8b19-b48a87e0238b/implementation-active-mid-v2.png`, `/Users/leo/.codex/visualizations/2026/07/23/019f8cdd-178e-7652-8b19-b48a87e0238b/implementation-active-table-v2.png`
- Full implementation capture: `/Users/leo/.codex/visualizations/2026/07/23/019f8cdd-178e-7652-8b19-b48a87e0238b/implementation-active-full-v2.png`
- Reference-style header capture: `/Users/leo/.codex/visualizations/2026/07/23/019f8cdd-178e-7652-8b19-b48a87e0238b/implementation-reference-style-top-final.png`
- Same-input visual comparison: `/Users/leo/.codex/visualizations/2026/07/23/019f8cdd-178e-7652-8b19-b48a87e0238b/comparison-top-normalized.png`

## Capture normalization

- Browser CSS viewport: 1440 × 768; device scale factor: 1.
- Source raster: 1440 × 722; implementation raster: 1433 × 718 because the local page exposes a native vertical scrollbar.
- The comparison input crops the source to 1433 × 718 so both visual regions use the implementation raster size. No density upscaling was used.
- State: default ETF module, latest range, all groups, top-of-page capture. The active-fund capture uses the same viewport and the `主观偏股基金` module.

## Review

### Findings

- [P2 fixed] 首屏 Hero 初版过高。第一版本地实现 Hero 约 300px，参考站约 194px，导致 KPI 区域整体下移、首屏密度明显偏松。Fix: 将 Hero 内部高度和上下 padding 调整为与参考站相同的比例，并压缩定义条；post-fix evidence is `implementation-market-top.png` and `comparison-top-normalized.png`.
- [P3 accepted] 文案与数据内容不同。参考站是国家队 ETF 页面，本实现按需求改为“全市场 ETF + 主观偏股基金”，所以标题、指标和表格内容不追求字面相同；保留同一视觉层级、色彩、边框、留白和交互结构。
- [P2 fixed] 首屏文字与设计按国家队 ETF 参考图重做：深色 270px Hero、金色等宽小标题、右侧更新时间、四段浅色口径条、金色/红色口径标签与无下划线的金色主标题。

### Required fidelity surfaces

- Fonts and typography: Hero and section titles use the reference Georgia / Songti SC serif hierarchy; UI copy uses the system/PingFang SC sans family; timestamps, filters and table headers use the reference ui-monospace family. Sizes, weights, line-heights and letter-spacing were checked against the live reference page.
- Spacing and layout rhythm: dark Hero → four-column definition strip → sticky filter toolbar → 250px left rail + card main area; the post-fix top regions align to the reference proportions.
- Colors and tokens: warm paper `#f4f0e7`, cream cards `#fffdf8`, navy `#0d1520`, red `#c94b43`, teal `#2b8f84`, gold `#d6a85f`, beige hairlines and soft shadow are scoped under `.market-page`.
- Image quality and asset fidelity: the reference has no required product imagery or logo asset; the implementation uses the same CSS-only geometric treatment and does not replace a source image with a placeholder.
- Copy and content: the page is titled “全市场资金流动跟踪”, exposes two switchable tabs, labels the live full-market ETF quote snapshot, detailed industry categories, the current 2026Q2 active-fund input, historical-column gaps, and the planned future national-team merge.

### Interaction checks

- Module switch: top tabs and left rail both switch `全市场 ETF` ↔ `主观偏股基金`; each switch resets to the latest view.
- Left rail scope: market Tab shows only the all-market total plus ETF group list; active-fund Tab shows only the active-fund scope item.
- ETF state: public quote proxy returns 1542 deduplicated rows across 16 categories, including `半导体 / 芯片`, `人工智能 / 算力`, `通信 / 光模块`, `新能源 / 电力设备` and `其他行业主题`.
- ETF data path: `/api/market-etf` serializes the public quote calls server-side and falls back from the real-time host to the delay host when the former is rate-limited or unavailable.
- Active chart: all 30 industries render in descending 2026Q2 weight; the change chart renders all 30 industries in descending Q2-Q1 change.
- Active table: first columns are 2026Q2, 2026Q1, change, underweight Q1/Q2, excess change, 25Q4 and 25Q3; explicit percentage column widths keep the sector, change and history groups visually balanced; rows are sorted by 2026Q2; inline bars are visible for both change columns.
- Active-fund data path: `/api/active-fund-allocation` refreshes public Sina / report-index sources daily, parses HTML tables when available, caches the result outside the repository, and keeps the latest public benchmark rows only as a safe fallback when a report is image-only.
- Range buttons: ETF uses `最新 / 近1月 / 近3月 / 今年以来 / 近1年 / 全区间`; active fund uses `最新季度 / 近2季度 / 近4季度 / 近1年 / 全区间`.
- Existing `/fund-allocation` route: still resolves to the old country-team page and retains its sidebar entry.
- Browser console check: no new `error` or `warning` logs captured after the final reload; earlier hot-reload errors were historical and did not recur.
- Full-market KPI strip: removed the four cards from the first supplied screenshot; the full-market page remains available with its charts, observation window and table.
- Observation window: moved to the first position in the full-market content area, before the charts.
- Full-market chart state: latest shows `分类成交额分布 / 分类日涨跌幅 / 分类规模变动估算`; interval ranges show `分类成交额分布 / 分类规模变动估算`.
- Classification and ordering: broad ETFs are split by major index names, market groups and tables sort by the latest value, and inline bars use relative magnitude rather than a fixed width.
- Typography QA: reference measurements now match at the key surfaces: Hero title 64px / 400 / 62.72px line-height, section title 37px / 400 / 40.7px line-height, range buttons 12px with 34px control height, card titles 14px / 800, and table headers 10px monospaced with 10px × 22px padding.

## Comparison history

1. Initial comparison found the P2 Hero-height / above-the-fold density mismatch.
2. Fixed `.market-hero-inner` and `.definition-strip > div` height/padding tokens.
3. Corrected the ETF scope from the initial 47-row national-team-style sample to a live, deduplicated full-market list from five public ETF board buckets; final browser capture observed 1542 ETFs across 16 detailed categories.
4. Rebuilt the active-fund chart/table around all 30 sectors, latest-first sorting, quarterly range labels and public-history gaps.
5. Recaptured the two tabs and interaction states; no actionable P0/P1/P2 differences remain.

## Implementation checklist

- [x] Full-market ETF and subjective active-fund modules share one reference-style page.
- [x] Old country-team page remains available separately.
- [x] Full-market ETF scope is the deduplicated five-board public quote list, not a national-team-only sample.
- [x] Charts, filters, tables and visible data-boundary notes render locally.
- [x] Market ETF uses a same-origin backend proxy with sequential public-data requests and delay-host fallback.
- [x] Active-fund table contains the requested latest/previous/change/underweight/history columns without estimated missing values.
- [x] Production build passes.
- [x] Browser-rendered screenshots and interaction checks pass.

## Follow-up Polish

- P3: maintain the public ETF snapshot cache and then enable true historical range calculations for each daily interval.
- P3: fill remaining 25Q3 sector cells from a single consistent public quarterly methodology before presenting them as comparable values.
- P3: merge the existing country-team ETF module into this page after the full-market and active-fund data interfaces stabilize.

final result: passed
