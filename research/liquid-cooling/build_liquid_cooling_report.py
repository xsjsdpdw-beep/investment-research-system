#!/usr/bin/env python3
"""Build a self-contained liquid-cooling research report from Markdown and JSON."""

from __future__ import annotations

import argparse
import html
import json
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence, Tuple


FORBIDDEN_DRAWING = set("╔╗╚╝╠╣║═┌┐└┘├┤│─")


def esc(value: Any) -> str:
    return html.escape("" if value is None else str(value), quote=True)


def inline_markdown(value: str) -> str:
    """Render the small safe inline subset used in the report."""
    text = html.escape(value, quote=False)
    placeholders: List[str] = []

    def hold(fragment: str) -> str:
        token = f"\x00{len(placeholders)}\x00"
        placeholders.append(fragment)
        return token

    text = re.sub(
        r"\[([^\]]+)\]\((https?://[^\s)]+)\)",
        lambda match: hold(
            f'<a href="{esc(match.group(2))}" target="_blank" rel="noreferrer">{match.group(1)}</a>'
        ),
        text,
    )
    text = re.sub(r"`([^`]+)`", lambda match: hold(f"<code>{match.group(1)}</code>"), text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", text)
    for index, fragment in enumerate(placeholders):
        text = text.replace(f"\x00{index}\x00", fragment)
    return text


def slugify(title: str, number: int) -> str:
    cleaned = re.sub(r"[^\w\u4e00-\u9fff]+", "-", title).strip("-").lower()
    return cleaned or f"section-{number:02d}"


def parse_table_row(line: str) -> List[str]:
    row = line.strip()
    if row.startswith("|"):
        row = row[1:]
    if row.endswith("|"):
        row = row[:-1]
    return [cell.strip() for cell in row.split("|")]


def is_table_separator(line: str) -> bool:
    cells = parse_table_row(line)
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", cell.replace(" ", "")) for cell in cells)


def render_table(lines: Sequence[str]) -> str:
    header = parse_table_row(lines[0])
    body = [parse_table_row(line) for line in lines[2:]]
    head_html = "".join(f"<th>{inline_markdown(cell)}</th>" for cell in header)
    rows: List[str] = []
    for row in body:
        padded = list(row) + [""] * max(0, len(header) - len(row))
        rows.append("<tr>" + "".join(f"<td>{inline_markdown(cell)}</td>" for cell in padded[: len(header)]) + "</tr>")
    return (
        '<div class="table-wrap"><table><thead><tr>'
        + head_html
        + "</tr></thead><tbody>"
        + "".join(rows)
        + "</tbody></table></div>"
    )


def render_markdown(markdown: str) -> Tuple[str, List[Tuple[str, str]]]:
    lines = markdown.splitlines()
    blocks: List[str] = []
    navigation: List[Tuple[str, str]] = []
    index = 0

    def is_block_start(current: str, next_line: str = "") -> bool:
        return bool(
            re.match(r"^#{1,6}\s+", current)
            or re.match(r"^\s*(?:[-*]\s+|\d+\.\s+)", current)
            or current.startswith(">")
            or current.strip() in {"---", "***"}
            or ("|" in current and is_table_separator(next_line))
        )

    while index < len(lines):
        line = lines[index]
        stripped = line.strip()
        if not stripped:
            index += 1
            continue

        heading = re.match(r"^(#{1,6})\s+(.+?)\s*$", stripped)
        if heading:
            level = len(heading.group(1))
            title = heading.group(2)
            if level == 2:
                section_id = slugify(title, len(navigation) + 1)
                navigation.append((section_id, title))
            else:
                section_id = slugify(title, index + 1)
            blocks.append(f'<h{level} id="{esc(section_id)}">{inline_markdown(title)}</h{level}>')
            index += 1
            continue

        if stripped in {"---", "***"}:
            blocks.append('<hr class="rule">')
            index += 1
            continue

        if stripped.startswith(">"):
            quote_lines: List[str] = []
            while index < len(lines) and lines[index].strip().startswith(">"):
                quote_lines.append(lines[index].strip()[1:].strip())
                index += 1
            blocks.append('<blockquote>' + "<br>".join(inline_markdown(item) for item in quote_lines) + "</blockquote>")
            continue

        if stripped.startswith("```"):
            language = stripped[3:].strip()
            code_lines: List[str] = []
            index += 1
            while index < len(lines) and not lines[index].strip().startswith("```"):
                code_lines.append(lines[index])
                index += 1
            if index < len(lines):
                index += 1
            code_text = esc("\n".join(code_lines))
            blocks.append(f'<pre class="code-block" data-language="{esc(language)}"><code>{code_text}</code></pre>')
            continue

        if "|" in line and index + 1 < len(lines) and is_table_separator(lines[index + 1]):
            table_lines = [line, lines[index + 1]]
            index += 2
            while index < len(lines) and lines[index].strip() and "|" in lines[index]:
                table_lines.append(lines[index])
                index += 1
            blocks.append(render_table(table_lines))
            continue

        list_match = re.match(r"^\s*([-*]|\d+\.)\s+(.+)$", line)
        if list_match:
            ordered = list_match.group(1)[0].isdigit()
            items: List[str] = []
            while index < len(lines):
                match = re.match(r"^\s*([-*]|\d+\.)\s+(.+)$", lines[index])
                if not match or (match.group(1)[0].isdigit()) != ordered:
                    break
                items.append(f"<li>{inline_markdown(match.group(2))}</li>")
                index += 1
            tag = "ol" if ordered else "ul"
            blocks.append(f"<{tag}>" + "".join(items) + f"</{tag}>")
            continue

        paragraph: List[str] = [stripped]
        index += 1
        while index < len(lines):
            current = lines[index]
            next_line = lines[index + 1] if index + 1 < len(lines) else ""
            if not current.strip() or is_block_start(current.strip(), next_line):
                break
            paragraph.append(current.strip())
            index += 1
        blocks.append("<p>" + inline_markdown(" ".join(paragraph)) + "</p>")

    return "\n".join(blocks), navigation


def bar(value: float, maximum: float, color: str) -> str:
    width = max(4.0, min(100.0, value / maximum * 100.0)) if maximum else 0
    return f'<span class="bar-track"><span class="bar-fill" style="width:{width:.1f}%;background:{color}"></span></span>'


def thermal_ribbon() -> str:
    return """
    <svg class="thermal-ribbon" viewBox="0 0 900 150" role="img" aria-label="热流地图视觉标识">
      <defs>
        <linearGradient id="heat" x1="0" x2="1">
          <stop offset="0" stop-color="#72cfff"/><stop offset=".42" stop-color="#f2783f"/><stop offset="1" stop-color="#f05a67"/>
        </linearGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="6" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <path d="M-20 108 C120 22 190 140 318 71 S503 34 600 89 S756 138 930 31" fill="none" stroke="#163c52" stroke-width="34" opacity=".55"/>
      <path d="M-20 108 C120 22 190 140 318 71 S503 34 600 89 S756 138 930 31" fill="none" stroke="url(#heat)" stroke-width="11" stroke-linecap="round" filter="url(#glow)"/>
      <g fill="#f5f7f9"><circle cx="160" cy="84" r="5"/><circle cx="318" cy="71" r="5"/><circle cx="600" cy="89" r="5"/><circle cx="760" cy="104" r="5"/></g>
      <g font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11" fill="#a9b7c5" letter-spacing="1.6"><text x="34" y="26">HEAT LOAD</text><text x="704" y="26">COOLING LOOP</text></g>
    </svg>
    """


def system_figure() -> str:
    return """
    <figure class="figure-card figure-system">
      <div class="figure-heading"><span>01 / THERMAL PATH</span><strong>热量如何从芯片离开机柜</strong></div>
      <svg viewBox="0 0 960 300" role="img" aria-label="液冷系统热流路径示意图">
        <defs><linearGradient id="flow" x1="0" x2="1"><stop stop-color="#f05a67"/><stop offset=".56" stop-color="#f2783f"/><stop offset="1" stop-color="#72cfff"/></linearGradient></defs>
        <path d="M190 150 H770" stroke="#21465a" stroke-width="34" stroke-linecap="round"/>
        <path d="M190 150 H770" stroke="url(#flow)" stroke-width="8" stroke-linecap="round" stroke-dasharray="18 14"/>
        <g transform="translate(38 94)"><rect width="152" height="112" rx="18" fill="#102c3c" stroke="#f05a67"/><rect x="22" y="29" width="108" height="54" rx="7" fill="#f05a67" opacity=".18"/><path d="M34 56h84M76 34v44" stroke="#f05a67" stroke-width="7"/><text x="76" y="101" text-anchor="middle" fill="#f5f7f9" font-size="16" font-weight="700">GPU / CPU</text></g>
        <g transform="translate(296 94)"><rect width="164" height="112" rx="18" fill="#102c3c" stroke="#f2783f"/><path d="M30 68h104M30 48h104M30 88h104" stroke="#f2783f" stroke-width="6"/><text x="82" y="28" text-anchor="middle" fill="#f5f7f9" font-size="15" font-weight="700">TIM + 冷板</text><text x="82" y="102" text-anchor="middle" fill="#a9b7c5" font-size="12">接热 / 带热</text></g>
        <g transform="translate(564 94)"><rect width="164" height="112" rx="18" fill="#102c3c" stroke="#72cfff"/><circle cx="82" cy="59" r="29" fill="none" stroke="#72cfff" stroke-width="7"/><path d="M82 30v58M53 59h58" stroke="#72cfff" stroke-width="4"/><text x="82" y="28" text-anchor="middle" fill="#f5f7f9" font-size="15" font-weight="700">CDU</text><text x="82" y="102" text-anchor="middle" fill="#a9b7c5" font-size="12">换热 / 泵控 / 监测</text></g>
        <g transform="translate(800 94)"><rect width="122" height="112" rx="18" fill="#102c3c" stroke="#72cfff"/><path d="M27 79 C39 40 83 40 96 79" fill="none" stroke="#72cfff" stroke-width="7"/><path d="M26 81h72" stroke="#72cfff" stroke-width="7"/><text x="61" y="28" text-anchor="middle" fill="#f5f7f9" font-size="15" font-weight="700">设施侧</text><text x="61" y="101" text-anchor="middle" fill="#a9b7c5" font-size="12">排热</text></g>
        <g fill="#a9b7c5" font-size="12" font-family="ui-monospace, SFMono-Regular, Menlo, monospace"><text x="54" y="268">HOT</text><text x="858" y="268">COOL</text><text x="480" y="43" text-anchor="middle">热量路径：接触热阻 → 流道换热 → 一次/二次侧换热 → 环境排热</text></g>
      </svg>
      <figcaption>图示为工作原理示意，不代表特定厂商系统边界。核心研究变量是热阻、流量均匀性、压降、漏液与维护性。</figcaption>
    </figure>
    """


def market_figure(data: Dict[str, Any]) -> str:
    points = [item for item in data["charts"]["market_size"] if item["series"] == "中国液冷市场"]
    years = ["2025", "2026", "2030"]
    values: Dict[str, List[float]] = {year: [] for year in years}
    for item in points:
        if item["year"] in values:
            values[item["year"]].append(item["value"])
    low = [min(values[year]) if values[year] else 0 for year in years]
    high = [max(values[year]) if values[year] else 0 for year in years]
    maximum = max(high) or 1000
    bars = []
    for index, year in enumerate(years):
        x = 136 + index * 235
        low_h = low[index] / maximum * 190
        high_h = high[index] / maximum * 190
        bars.append(
            f'<g><rect x="{x}" y="{238-high_h:.1f}" width="72" height="{high_h:.1f}" rx="10" fill="#f2783f" opacity=".9"/>'
            f'<rect x="{x+16}" y="{238-low_h:.1f}" width="40" height="{low_h:.1f}" rx="8" fill="#72cfff"/>'
            f'<text x="{x+36}" y="270" text-anchor="middle">{year}</text>'
            f'<text x="{x+36}" y="{220-high_h:.1f}" text-anchor="middle" class="value-label">{int(high[index])}</text>'
            f'<text x="{x+36}" y="{255-low_h:.1f}" text-anchor="middle" class="value-label low">{int(low[index])}</text></g>'
        )
    return (
        '<figure class="figure-card"><div class="figure-heading"><span>02 / MARKET RANGE</span><strong>中国液冷市场：机构区间而非单一数字</strong></div>'
        '<svg viewBox="0 0 850 320" role="img" aria-label="中国液冷市场规模区间柱状图"><g class="grid"><path d="M78 238H790M78 190H790M78 142H790M78 94H790M78 46H790"/></g>'
        + "".join(bars)
        + '<g fill="#a9b7c5" font-size="12"><text x="78" y="242" text-anchor="end">0</text><text x="78" y="194" text-anchor="end">250</text><text x="78" y="146" text-anchor="end">500</text><text x="78" y="98" text-anchor="end">750</text><text x="78" y="50" text-anchor="end">1000</text><text x="786" y="300" text-anchor="end">单位：亿元；蓝色=区间下沿，橙色=区间上沿</text></g></svg>'
        '<figcaption>2025—2030的公开预测存在市场边界差异，图中只展示本报告台账内的区间，不进行跨来源相加。来源：<code>local-guosheng-2026-06</code>、<code>local-huayuan-2026-06</code>、<code>market-iim-china-2030-2026</code>。</figcaption></figure>'
    )


def value_pool_figure(data: Dict[str, Any]) -> str:
    colors = ["#f05a67", "#f2783f", "#72cfff", "#4aa6c7", "#a9b7c5"]
    items = data["charts"]["value_pool"]
    rows = []
    for index, item in enumerate(items):
        top = 42 + index * 48
        rows.append(
            f'<text x="22" y="{top+17}" class="label">{esc(item["component"])}</text>'
            f'<rect x="196" y="{top}" width="490" height="23" rx="11" fill="#16394b"/>'
            f'<rect x="196" y="{top}" width="{max(40, item["share_high"]*4.9):.1f}" height="23" rx="11" fill="{colors[index]}" opacity=".9"/>'
            f'<text x="710" y="{top+17}" class="value-label">{item["share_low"]}–{item["share_high"]}%</text>'
        )
    return (
        '<figure class="figure-card"><div class="figure-heading"><span>03 / VALUE POOL</span><strong>价值量集中，但价值量不等于利润</strong></div>'
        '<svg viewBox="0 0 850 300" role="img" aria-label="液冷产业链价值量区间图">'
        + "".join(rows)
        + '<text x="22" y="286" class="note">机构研究常见区间；系统边界、平台和是否含工程服务会改变比例。</text></svg>'
        '<figcaption>冷板与CDU的价值量相对集中，UQD虽然占比相对较低，但可靠性和认证可能带来高议价权。来源：<code>local-guosheng-2026-06</code>、<code>local-guangfa-2026-05</code>。</figcaption></figure>'
    )


def competition_figure(data: Dict[str, Any]) -> str:
    rows = data["charts"]["competition_matrix"]
    keys = [("system", "系统"), ("certification", "认证"), ("overseas", "海外"), ("scale", "规模"), ("valuation_sensitivity", "估值敏感")]
    header = "".join(f'<text x="{250+i*96}" y="28" text-anchor="middle" class="axis">{title}</text>' for i, (_, title) in enumerate(keys))
    cells = [header]
    for row_index, row in enumerate(rows):
        y = 49 + row_index * 36
        cells.append(f'<text x="16" y="{y+18}" class="label">{esc(row["name"])}</text>')
        for col_index, (key, _) in enumerate(keys):
            score = int(row[key])
            color = {1: "#173243", 2: "#28546a", 3: "#3c7e98", 4: "#f2783f", 5: "#f05a67"}[score]
            x = 210 + col_index * 96
            cells.append(f'<rect x="{x}" y="{y}" width="72" height="24" rx="8" fill="{color}"/><text x="{x+36}" y="{y+17}" text-anchor="middle" class="cell">{score}</text>')
    return (
        '<figure class="figure-card"><div class="figure-heading"><span>04 / COMPETITION MAP</span><strong>竞争力来自认证、交付与客户覆盖的组合</strong></div>'
        '<svg viewBox="0 0 850 300" role="img" aria-label="液冷产业链公司竞争力矩阵">'
        + "".join(cells)
        + '<text x="16" y="286" class="note">5分为相对强，1分为相对弱；为研究者结构化判断，不是市场份额。</text></svg>'
        '<figcaption>重点公司需要按产品环节拆开比较，避免把系统集成、连接器、材料和化工平台放入同一套竞争评价。来源：公司公开资料、机构研报与研究判断。</figcaption></figure>'
    )


def financial_figure(data: Dict[str, Any]) -> str:
    focus = ["英维克", "中石科技", "申菱环境", "高澜股份"]
    rows: List[str] = []
    for index, name in enumerate(focus):
        values = [item for item in data["charts"]["financials"] if item["name"] == name and item.get("year") in {2023, 2025}]
        by_year = {item["year"]: item for item in values}
        x = 198 + index * 154
        rev23 = by_year.get(2023, {}).get("revenue") or 0
        rev25 = by_year.get(2025, {}).get("revenue") or 0
        max_rev = max(70, rev23, rev25)
        h23 = rev23 / max_rev * 132
        h25 = rev25 / max_rev * 132
        rows.append(f'<g><rect x="{x}" y="{204-h23:.1f}" width="28" height="{h23:.1f}" rx="6" fill="#72cfff"/><rect x="{x+38}" y="{204-h25:.1f}" width="28" height="{h25:.1f}" rx="6" fill="#f2783f"/><text x="{x+33}" y="235" text-anchor="middle" class="label">{esc(name)}</text><text x="{x+14}" y="{197-h23:.1f}" text-anchor="middle" class="value-label">{rev23:.1f}</text><text x="{x+52}" y="{197-h25:.1f}" text-anchor="middle" class="value-label">{rev25:.1f}</text></g>')
    return (
        '<figure class="figure-card"><div class="figure-heading"><span>05 / FINANCIAL LENS</span><strong>营收增长必须和利润、现金流一起看</strong></div>'
        '<svg viewBox="0 0 850 280" role="img" aria-label="重点公司2023与2025营业收入对比图"><path d="M84 204H790M84 138H790M84 72H790" class="grid"/><g fill="#a9b7c5" font-size="12"><text x="78" y="208" text-anchor="end">0</text><text x="78" y="142" text-anchor="end">35</text><text x="78" y="76" text-anchor="end">70</text><text x="770" y="260" text-anchor="end">单位：亿元；蓝色=2023，橙色=2025</text></g>'
        + "".join(rows)
        + '</svg><figcaption>图中只比较公司整体营业收入，不能替代液冷分部收入；正文财务表同时列示毛利率、净利率、ROE、研发率、OCF和周转指标。来源：<code>ifind-a-financials-2026-07-21</code>。</figcaption></figure>'
    )


def source_drawer(data: Dict[str, Any]) -> str:
    entries = []
    for source in data["sources"]:
        link = f'<a href="{esc(source["url"])}" target="_blank" rel="noreferrer">打开来源</a>' if source.get("url") else "本地/终端来源"
        location = source.get("path") or source.get("url") or ""
        entries.append(
            f'<article class="source-item"><div class="source-id">{esc(source["id"])}</div><h3>{esc(source["title"])}</h3><p>{esc(source.get("date", ""))} · {link}</p><p class="source-use">{esc(source.get("use", ""))}</p><details><summary>定位信息</summary><code>{esc(location)}</code></details></article>'
        )
    return '<aside class="source-drawer" id="source-drawer"><div class="drawer-head"><span>SOURCE LEDGER</span><button type="button" data-close-drawer>关闭</button></div><div class="source-list">' + "".join(entries) + "</div></aside>"


def stat_card(label: str, value: str, detail: str, tone: str = "orange") -> str:
    return f'<div class="stat-card tone-{tone}"><span>{esc(label)}</span><strong>{esc(value)}</strong><small>{esc(detail)}</small></div>'


def build_html(markdown: str, data: Dict[str, Any]) -> str:
    body, navigation = render_markdown(markdown)
    thesis = data["thesis"]
    best = thesis["best_segments"]
    priorities = thesis["company_priorities"]
    nav_html = "".join(f'<a href="#{esc(section_id)}"><span>{index:02d}</span>{inline_markdown(title)}</a>' for index, (section_id, title) in enumerate(navigation, 1))
    best_cards = "".join(
        f'<article class="segment-card"><div class="segment-rank">0{item["rank"]}</div><div><span class="eyebrow">{esc(item["category"])}</span><h3>{esc(item["segment"])}</h3><p>{esc(item["reason"])}</p><div class="company-tags">' + "".join(f'<span>{esc(name)}</span>' for name in item["companies"]) + '</div></div></article>'
        for item in best
    )
    priority_cards = "".join(f'<div class="priority-row"><span>{esc(item["tier"])}</span><strong>{esc(" / ".join(item["names"]))}</strong><em>{esc(item["focus"])}</em></div>' for item in priorities)
    catalysts = "".join(f'<li>{esc(item)}</li>' for item in thesis["catalysts"])
    validate = "".join(f'<li>{esc(item)}</li>' for item in thesis["validation_conditions"])
    invalid = "".join(f'<li>{esc(item)}</li>' for item in thesis["invalidation_conditions"])
    return f'''<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="液冷行业研究框架：投资结论、产业链、商业模式、财务与跟踪体系">
  <title>液冷行业研究框架 v3 · Thermal Cartography</title>
  <style>
    :root {{ --ink:#071522; --ink-2:#0d2332; --panel:#102c3c; --panel-2:#14394c; --line:#24485b; --text:#f5f7f9; --muted:#a9b7c5; --orange:#f2783f; --coral:#f05a67; --cyan:#72cfff; --cream:#f0eee8; --shadow:0 20px 60px rgba(0,0,0,.25); }}
    * {{ box-sizing:border-box; }}
    html {{ scroll-behavior:smooth; }}
    body {{ margin:0; background:var(--ink); color:var(--text); font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif; line-height:1.68; }}
    body::before {{ content:""; position:fixed; inset:0; pointer-events:none; opacity:.14; background-image:radial-gradient(rgba(255,255,255,.14) .7px, transparent .7px); background-size:17px 17px; mix-blend-mode:screen; }}
    a {{ color:var(--cyan); text-decoration:none; }} a:hover {{ color:#d1f1ff; }}
    code {{ font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:.82em; color:#ffd2b5; background:rgba(242,120,63,.12); padding:.18em .42em; border-radius:5px; }}
    .app-shell {{ display:grid; grid-template-columns:260px minmax(0,1fr); min-height:100vh; }}
    .rail {{ position:sticky; top:0; height:100vh; padding:27px 21px; border-right:1px solid var(--line); background:rgba(7,21,34,.86); backdrop-filter:blur(16px); z-index:8; }}
    .brand {{ display:flex; align-items:center; gap:11px; margin-bottom:30px; }}
    .brand-mark {{ width:32px; height:32px; border-radius:10px; background:linear-gradient(135deg,var(--cyan),var(--orange) 62%,var(--coral)); box-shadow:0 0 24px rgba(242,120,63,.28); }}
    .brand strong {{ display:block; font-family:Georgia,"Noto Serif SC",serif; letter-spacing:.02em; }} .brand small {{ color:var(--muted); font-size:10px; letter-spacing:.16em; }}
    .rail-label {{ color:var(--muted); font:10px ui-monospace,monospace; letter-spacing:.15em; margin:23px 0 10px; }}
    .nav {{ display:grid; gap:4px; max-height:calc(100vh - 190px); overflow:auto; scrollbar-width:thin; }}
    .nav a {{ display:flex; gap:10px; align-items:center; padding:8px 8px; border-radius:9px; color:var(--muted); font-size:12px; transition:.2s ease; }}
    .nav a:hover {{ color:var(--text); background:rgba(114,207,255,.08); transform:translateX(2px); }} .nav a span {{ color:var(--orange); font:10px ui-monospace,monospace; width:22px; }}
    .rail-footer {{ position:absolute; bottom:26px; color:#6e8997; font:10px ui-monospace,monospace; line-height:1.5; }}
    main {{ min-width:0; }}
    .hero {{ position:relative; overflow:hidden; min-height:600px; padding:58px clamp(28px,7vw,110px) 48px; background:radial-gradient(circle at 80% 4%, rgba(242,120,63,.20), transparent 29%), radial-gradient(circle at 10% 42%, rgba(114,207,255,.12), transparent 33%), linear-gradient(135deg,#081b2a 0%,#071522 60%); border-bottom:1px solid var(--line); }}
    .hero::after {{ content:""; position:absolute; width:350px; height:350px; border:1px solid rgba(114,207,255,.18); border-radius:50%; right:8%; top:80px; box-shadow:0 0 0 26px rgba(114,207,255,.02),0 0 0 52px rgba(114,207,255,.02); }}
    .hero-content {{ position:relative; z-index:1; max-width:1160px; margin:auto; }}
    .eyebrow, .hero-kicker {{ display:inline-block; font:11px ui-monospace,monospace; text-transform:uppercase; letter-spacing:.17em; color:var(--cyan); }}
    .hero h1 {{ max-width:880px; margin:17px 0 14px; font:700 clamp(39px,6vw,76px)/1.03 Georgia,"Noto Serif SC",serif; letter-spacing:-.055em; }}
    .hero h1 em {{ color:var(--orange); font-style:normal; }} .hero-subtitle {{ max-width:730px; color:#c7d2d9; font-size:16px; margin:0; }}
    .thermal-ribbon {{ display:block; position:absolute; width:min(800px,72vw); right:-15px; top:40px; opacity:.78; z-index:0; }}
    .hero-meta {{ display:flex; flex-wrap:wrap; gap:11px; margin:29px 0 30px; }} .meta-chip {{ color:var(--muted); border:1px solid var(--line); background:rgba(13,35,50,.72); padding:7px 10px; border-radius:999px; font:11px ui-monospace,monospace; }} .meta-chip strong {{ color:var(--text); }}
    .stats {{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; max-width:1020px; }} .stat-card {{ padding:16px 17px; background:rgba(16,44,60,.74); border:1px solid rgba(114,207,255,.13); border-radius:13px; box-shadow:var(--shadow); }} .stat-card span {{ display:block; color:var(--muted); font:10px ui-monospace,monospace; letter-spacing:.12em; }} .stat-card strong {{ display:block; margin:7px 0 2px; font:700 27px Georgia,"Noto Serif SC",serif; }} .stat-card small {{ color:#9eb3bd; font-size:11px; }} .tone-orange strong {{ color:var(--orange); }} .tone-cyan strong {{ color:var(--cyan); }} .tone-coral strong {{ color:var(--coral); }}
    .hero-note {{ margin:24px 0 0; max-width:960px; color:#8ea6b1; font-size:12px; }}
    .canvas {{ max-width:1160px; margin:0 auto; padding:46px clamp(22px,5vw,75px) 86px; }}
    .section-kicker {{ margin:0 0 8px; color:var(--orange); font:11px ui-monospace,monospace; letter-spacing:.15em; }} .canvas h2, .article h2 {{ font:700 31px/1.16 Georgia,"Noto Serif SC",serif; letter-spacing:-.03em; margin:0 0 12px; }}
    .canvas-intro {{ color:var(--muted); margin:0 0 25px; max-width:800px; }}
    .segment-grid {{ display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin:22px 0 30px; }} .segment-card {{ display:grid; grid-template-columns:42px 1fr; gap:12px; padding:19px; background:linear-gradient(150deg,rgba(20,57,76,.95),rgba(13,35,50,.95)); border:1px solid #235269; border-radius:14px; min-height:210px; }} .segment-rank {{ display:flex; align-items:flex-start; justify-content:center; color:var(--orange); font:24px Georgia,serif; }} .segment-card h3 {{ margin:6px 0 6px; font-size:19px; }} .segment-card p {{ margin:0; color:var(--muted); font-size:12px; line-height:1.65; }} .company-tags {{ display:flex; flex-wrap:wrap; gap:6px; margin-top:16px; }} .company-tags span {{ color:#d8e2e7; background:rgba(114,207,255,.08); border:1px solid rgba(114,207,255,.2); padding:3px 7px; border-radius:99px; font-size:10px; }}
    .priority-panel {{ padding:17px 20px; border-left:3px solid var(--orange); background:rgba(242,120,63,.06); margin:20px 0 35px; }} .priority-row {{ display:grid; grid-template-columns:90px minmax(180px,260px) 1fr; gap:14px; padding:10px 0; border-bottom:1px solid rgba(169,183,197,.12); align-items:start; }} .priority-row:last-child {{ border-bottom:0; }} .priority-row span {{ color:var(--orange); font:10px ui-monospace,monospace; letter-spacing:.12em; }} .priority-row strong {{ font-size:14px; }} .priority-row em {{ font-style:normal; color:var(--muted); font-size:12px; }}
    .signal-grid {{ display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin:25px 0 46px; }} .signal-card {{ padding:17px; background:#0d2332; border:1px solid var(--line); border-radius:12px; }} .signal-card h3 {{ margin:0 0 8px; font-size:14px; }} .signal-card ul {{ margin:0; padding-left:17px; color:var(--muted); font-size:12px; }} .signal-card li::marker {{ color:var(--orange); }}
    .visual-stack {{ display:grid; gap:18px; margin:25px 0 56px; }} .figure-card {{ margin:0; padding:20px 21px 17px; background:linear-gradient(160deg,#102c3c,#0c2230); border:1px solid #235269; border-radius:15px; box-shadow:0 14px 34px rgba(0,0,0,.17); }} .figure-heading {{ display:flex; justify-content:space-between; align-items:baseline; gap:15px; margin-bottom:13px; }} .figure-heading span {{ color:var(--orange); font:10px ui-monospace,monospace; letter-spacing:.14em; }} .figure-heading strong {{ font:18px Georgia,"Noto Serif SC",serif; }} .figure-card svg {{ display:block; width:100%; height:auto; overflow:visible; }} .figure-card svg text {{ fill:#f5f7f9; font-family:ui-sans-serif,"Noto Sans SC",sans-serif; font-size:13px; }} .figure-card svg .grid {{ stroke:#23485b; fill:none; stroke-width:1; }} .figure-card svg .label {{ fill:#d7e2e7; font-size:12px; }} .figure-card svg .axis, .figure-card svg .note {{ fill:#a9b7c5; font-size:11px; }} .figure-card svg .value-label {{ fill:#ffd2b5; font:11px ui-monospace,monospace; }} .figure-card svg .value-label.low {{ fill:#b8eaff; }} .figure-card svg .cell {{ font:11px ui-monospace,monospace; }} .figure-card figcaption, .figure-card > figcaption {{ margin:12px 0 0; color:#8fa7b2; font-size:11px; line-height:1.6; }}
    .article-wrap {{ max-width:1160px; margin:0 auto; padding:0 clamp(22px,5vw,75px) 90px; }} .article {{ color:#d8e2e7; }} .article h1 {{ font:700 42px/1.12 Georgia,"Noto Serif SC",serif; margin:0 0 26px; }} .article h2 {{ padding-top:58px; scroll-margin-top:22px; color:#fff; }} .article h3 {{ margin:30px 0 10px; color:#fff; font:700 21px/1.3 Georgia,"Noto Serif SC",serif; }} .article h4 {{ color:var(--orange); }} .article p {{ max-width:920px; margin:11px 0; color:#c1d0d7; font-size:14px; }} .article ul, .article ol {{ max-width:900px; color:#c1d0d7; padding-left:23px; font-size:14px; }} .article li {{ margin:5px 0; }} .article li::marker {{ color:var(--orange); }} .article blockquote {{ max-width:920px; margin:20px 0; padding:14px 17px; background:rgba(114,207,255,.06); border-left:3px solid var(--cyan); color:#d8edf5; font-family:Georgia,"Noto Serif SC",serif; }} .rule {{ border:0; border-top:1px solid var(--line); margin:43px 0 15px; }}
    .table-wrap {{ max-width:100%; overflow:auto; margin:18px 0 25px; border:1px solid var(--line); border-radius:10px; background:rgba(13,35,50,.66); }} table {{ width:100%; border-collapse:collapse; min-width:650px; font-size:12px; }} th, td {{ padding:9px 11px; text-align:left; border-bottom:1px solid rgba(169,183,197,.12); vertical-align:top; }} th {{ position:sticky; top:0; background:#173a4c; color:#fff; font:11px ui-monospace,monospace; white-space:nowrap; }} td {{ color:#bfd0d7; }} tr:last-child td {{ border-bottom:0; }} tr:hover td {{ background:rgba(114,207,255,.04); }}
    .code-block {{ overflow:auto; padding:15px; background:#061019; border:1px solid var(--line); border-radius:10px; color:#b8eaff; }}
    .source-drawer {{ position:fixed; z-index:12; top:0; right:0; width:min(560px,92vw); height:100vh; overflow:auto; transform:translateX(102%); transition:transform .28s ease; background:#0a1e2c; border-left:1px solid var(--line); box-shadow:-30px 0 80px rgba(0,0,0,.4); }} body.sources-open .source-drawer {{ transform:translateX(0); }} .drawer-head {{ display:flex; justify-content:space-between; padding:19px 22px; position:sticky; top:0; background:rgba(10,30,44,.92); backdrop-filter:blur(10px); border-bottom:1px solid var(--line); color:var(--orange); font:11px ui-monospace,monospace; letter-spacing:.14em; }} button {{ color:var(--text); background:transparent; border:1px solid var(--line); padding:6px 9px; border-radius:7px; cursor:pointer; }} .source-list {{ padding:17px 22px 40px; }} .source-item {{ padding:16px 0; border-bottom:1px solid rgba(169,183,197,.14); }} .source-item h3 {{ margin:5px 0; font:16px Georgia,"Noto Serif SC",serif; }} .source-item p {{ margin:4px 0; color:var(--muted); font-size:12px; }} .source-id {{ color:var(--orange); font:10px ui-monospace,monospace; }} details {{ margin-top:9px; color:#8fa7b2; font-size:11px; }}
    .open-sources {{ position:fixed; right:22px; bottom:20px; z-index:10; color:var(--ink); background:var(--cyan); border:0; border-radius:99px; padding:10px 14px; font-weight:700; box-shadow:0 8px 24px rgba(0,0,0,.24); }}
    .footer {{ max-width:1160px; margin:auto; padding:25px clamp(22px,5vw,75px) 45px; border-top:1px solid var(--line); color:#76909b; font:11px ui-monospace,monospace; }}
    @media (max-width:980px) {{ .app-shell {{ display:block; }} .rail {{ position:relative; height:auto; padding:16px 22px; border-right:0; border-bottom:1px solid var(--line); }} .brand {{ margin-bottom:12px; }} .nav {{ display:flex; overflow:auto; max-height:none; padding-bottom:2px; }} .nav a {{ white-space:nowrap; }} .rail-label, .rail-footer {{ display:none; }} .hero {{ min-height:570px; padding-top:40px; }} .thermal-ribbon {{ top:30px; opacity:.35; }} .stats {{ grid-template-columns:repeat(2,1fr); }} .segment-grid, .signal-grid {{ grid-template-columns:1fr; }} .priority-row {{ grid-template-columns:80px 1fr; }} .priority-row em {{ grid-column:2; }} }}
    @media (max-width:600px) {{ .hero {{ padding:32px 19px 35px; min-height:610px; }} .hero h1 {{ font-size:43px; }} .hero-subtitle {{ font-size:14px; }} .thermal-ribbon {{ width:710px; top:95px; right:-245px; opacity:.27; }} .stats {{ gap:8px; }} .stat-card {{ padding:12px; }} .stat-card strong {{ font-size:22px; }} .canvas, .article-wrap {{ padding-left:17px; padding-right:17px; }} .canvas h2, .article h2 {{ font-size:27px; }} .figure-card {{ padding:15px 12px; }} .figure-heading {{ display:block; }} .figure-heading strong {{ display:block; margin-top:5px; font-size:17px; }} .figure-card svg {{ min-width:620px; }} .figure-card {{ overflow:auto; }} .priority-row {{ display:block; }} .priority-row strong, .priority-row em {{ display:block; margin-top:5px; }} .open-sources {{ right:12px; bottom:12px; }} }}
    @media print {{ body {{ background:#fff; color:#111; }} body::before, .rail, .open-sources, .source-drawer {{ display:none!important; }} .app-shell {{ display:block; }} .hero, .figure-card, .priority-panel, .stat-card, .signal-card {{ background:#fff; color:#111; box-shadow:none; border:1px solid #c9d2d6; }} .hero {{ min-height:auto; padding:30px 20px; }} .hero h1, .canvas h2, .article h2, .article h3 {{ color:#111; }} .hero-subtitle, .article p, .article li, td {{ color:#28343a; }} .article h2 {{ break-before:page; }} .visual-stack {{ break-inside:avoid; }} a {{ color:#111; text-decoration:underline; }} .table-wrap {{ border-color:#c9d2d6; }} th {{ background:#edf2f4; color:#111; }} .thermal-ribbon {{ opacity:.28; }} }}
  </style>
</head>
<body>
  <div class="app-shell">
    <aside class="rail">
      <div class="brand"><span class="brand-mark"></span><div><strong>液冷行业研究</strong><small>THERMAL CARTOGRAPHY / V3</small></div></div>
      <div class="rail-label">CHAPTERS</div>
      <nav class="nav">{nav_html}</nav>
      <div class="rail-footer">CUT-OFF {esc(data["meta"]["data_cutoff"])}<br>MARKET RESEARCH / A-SHARES FIRST</div>
    </aside>
    <main>
      <section class="hero" id="top"><div class="hero-content"><span class="hero-kicker">LIQUID COOLING / INVESTMENT FRAMEWORK V3</span><h1>热流正在重写<br><em>算力基础设施</em>的价值地图</h1><p class="hero-subtitle">从芯片热密度出发，穿过冷板、CDU、UQD与工质，回到订单、现金流和估值。首屏先给判断，正文再给证据。</p><div class="hero-meta"><span class="meta-chip"><strong>数据截止</strong> {esc(data["meta"]["data_cutoff"])}</span><span class="meta-chip"><strong>基准版本</strong> {esc(data["meta"]["baseline_cutoff"])}</span><span class="meta-chip"><strong>覆盖</strong> A股产业链 / 海外对标</span><span class="meta-chip"><strong>阶段</strong> 商业化加速期</span></div><div class="stats">{stat_card("BEST LINK", "CDU", "系统交付与订单前置", "orange")}{stat_card("HIGH BETA", "冷板 / TIM", "NV平台认证与单位价值量", "cyan")}{stat_card("BOTTLENECK", "UQD", "认证与可靠性优先", "coral")}{stat_card("MUST WATCH", "现金流", "订单不是回款", "cyan")}</div><p class="hero-note">核心观点：优先研究CDU及液冷基础设施；以NV定制冷板/TIM获取平台升级弹性；UQD与高端工质作为国产替代卡位观察。估值和业绩必须回到同一张表里检验。</p></div>{thermal_ribbon()}</section>
      <section class="canvas" id="investment-conclusion"><p class="section-kicker">00 / INVESTMENT CONCLUSION</p><h2>把行业机会拆成可验证的公司机会</h2><p class="canvas-intro">液冷行业的增长确定性高于单家公司业绩确定性。下方先呈现环节优先级、公司关注顺序和核心验证条件；随后正文按原始模块顺序展开。</p><div class="segment-grid">{best_cards}</div><div class="priority-panel"><div class="section-kicker">COMPANY PRIORITY</div>{priority_cards}</div><div class="signal-grid"><article class="signal-card"><h3>催化剂</h3><ul>{catalysts}</ul></article><article class="signal-card"><h3>验证条件</h3><ul>{validate}</ul></article><article class="signal-card"><h3>失效条件</h3><ul>{invalid}</ul></article></div><div class="visual-stack">{system_figure()}{market_figure(data)}{value_pool_figure(data)}{competition_figure(data)}{financial_figure(data)}</div></section>
      <section class="article-wrap"><article class="article">{body}</article></section>
      <footer class="footer">液冷行业研究框架 v3 · {esc(data["meta"]["data_cutoff"])} · 事实、预测与判断已尽量分栏标注。<br>本页面为独立HTML，无外部脚本、样式、字体或图片依赖。</footer>
    </main>
  </div>
  {source_drawer(data)}
  <button class="open-sources" type="button" data-open-drawer>来源台账</button>
  <script>
    (function () {{
      const body = document.body;
      document.querySelector('[data-open-drawer]').addEventListener('click', function () {{ body.classList.add('sources-open'); }});
      document.querySelector('[data-close-drawer]').addEventListener('click', function () {{ body.classList.remove('sources-open'); }});
      document.addEventListener('keydown', function (event) {{ if (event.key === 'Escape') body.classList.remove('sources-open'); }});
    }}());
  </script>
</body>
</html>'''


def validate_inputs(markdown_path: Path, data_path: Path) -> Tuple[str, Dict[str, Any]]:
    if not markdown_path.exists() or not markdown_path.is_file():
        raise FileNotFoundError(f"Markdown not found: {markdown_path}")
    if not data_path.exists() or not data_path.is_file():
        raise FileNotFoundError(f"Data not found: {data_path}")
    markdown = markdown_path.read_text(encoding="utf-8")
    if not markdown.strip():
        raise ValueError("Markdown is empty")
    data = json.loads(data_path.read_text(encoding="utf-8"))
    required = {"meta", "thesis", "segments", "companies", "metrics", "charts", "catalysts", "risks", "questions", "sources"}
    missing = required.difference(data)
    if missing:
        raise ValueError(f"Missing data keys: {sorted(missing)}")
    if not data["sources"]:
        raise ValueError("Source ledger is empty")
    forbidden = [char for char in FORBIDDEN_DRAWING if char in markdown]
    if forbidden:
        raise ValueError(f"Forbidden box drawing in Markdown: {forbidden}")
    return markdown, data


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--markdown", required=True, type=Path)
    parser.add_argument("--data", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--check", action="store_true", help="validate and render in memory without writing output")
    args = parser.parse_args()
    markdown, data = validate_inputs(args.markdown, args.data)
    result = build_html(markdown, data)
    if args.check:
        assert "<!doctype html>" in result.lower()
        assert "source-drawer" in result
        assert "THERMAL CARTOGRAPHY" in result
        print(f"liquid cooling report build check: PASS ({len(result):,} chars)")
        return 0
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(result, encoding="utf-8")
    print(f"wrote {args.output} ({len(result):,} chars)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
