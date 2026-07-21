#!/usr/bin/env python3
"""Build a self-contained liquid-cooling research report from Markdown and JSON."""

from __future__ import annotations

import argparse
import base64
import html
import json
import mimetypes
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple


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
        r"!\[([^\]]+)\]\((assets/[^\s)]+\.(?:svg|png|jpg|jpeg|webp))\)",
        lambda match: hold(
            f'<span class="asset-ref" data-asset="{esc(match.group(2))}" data-alt="{esc(match.group(1))}"></span>'
        ),
        text,
    )
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
    table = (
        '<div class="table-wrap"><table><thead><tr>'
        + head_html
        + "</tr></thead><tbody>"
        + "".join(rows)
        + "</tbody></table></div>"
    )
    return '<details class="data-details"><summary>展开明细数据</summary>' + table + '</details>'


def replace_asset_refs(body: str, asset_svgs: Dict[str, str], asset_images: Optional[Dict[str, str]] = None) -> str:
    pattern = re.compile(r'<span class="asset-ref" data-asset="([^"]+)" data-alt="([^"]+)"></span>')
    asset_images = asset_images or {}

    def replace(match: re.Match[str]) -> str:
        asset_path, alt = match.group(1), match.group(2)
        svg = asset_svgs.get(asset_path)
        if svg:
            return f'<figure class="figure-card editorial-plate md-figure"><div class="md-figure-svg">{svg}</div><figcaption>{esc(alt)}</figcaption></figure>'
        image_data = asset_images.get(asset_path)
        if image_data:
            return f'<figure class="figure-card editorial-plate md-figure md-image-figure"><img src="{image_data}" alt="{esc(alt)}"><figcaption>{esc(alt)}</figcaption></figure>'
        return f'<figure class="figure-card editorial-plate md-figure"><img src="{esc(asset_path)}" alt="{esc(alt)}"><figcaption>{esc(alt)}</figcaption></figure>'

    return pattern.sub(replace, body)


def render_markdown(markdown: str, asset_svgs: Optional[Dict[str, str]] = None, asset_images: Optional[Dict[str, str]] = None) -> Tuple[str, List[Tuple[str, str]]]:
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
            or re.fullmatch(r"!\[[^\]]+\]\(assets/[^\s)]+\.(?:svg|png|jpg|jpeg|webp)\)", current)
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

        if re.fullmatch(r"!\[[^\]]+\]\(assets/[^\s)]+\.(?:svg|png|jpg|jpeg|webp)\)", stripped):
            blocks.append(inline_markdown(stripped))
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

    return replace_asset_refs("\n".join(blocks), asset_svgs or {}, asset_images or {}), navigation


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


def penetration_figure(data: Dict[str, Any]) -> str:
    points = data["charts"].get("penetration", [])
    values = [float(item["value"]) for item in points if isinstance(item.get("value"), (int, float))]
    labels = [str(item["year"]) for item in points if isinstance(item.get("value"), (int, float))]
    maximum = max(60.0, max(values or [1]))
    left, top, width, height = 86, 55, 680, 170
    coords = []
    for index, value in enumerate(values):
        x = left + index * width / max(1, len(values) - 1)
        y = top + height - value / maximum * height
        coords.append((x, y, value))
    path = " ".join(("M" if index == 0 else "L") + f"{x:.1f} {y:.1f}" for index, (x, y, _) in enumerate(coords))
    area = f"M{left} {top+height} " + " ".join(f"L{x:.1f} {y:.1f}" for x, y, _ in coords) + f" L{left+width} {top+height} Z"
    marks = []
    for index, (x, y, value) in enumerate(coords):
        marks.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="6" fill="#ef6437" stroke="#ffffff" stroke-width="3"/><text x="{x:.1f}" y="{y-15:.1f}" text-anchor="middle" class="value-label">{value:.0f}%</text><text x="{x:.1f}" y="{top+height+27}" text-anchor="middle" class="label">{esc(labels[index])}</text>')
    grid = "".join(f'<path d="M{left} {top+height-index*height/3:.1f}H{left+width}" class="grid"/><text x="{left-10}" y="{top+height-index*height/3+4:.1f}" text-anchor="end" class="axis">{int(maximum*index/3)}%</text>' for index in range(4))
    return (
        '<figure class="figure-card editorial-plate"><div class="figure-heading"><span>02B / PENETRATION CURVE</span><strong>液冷采用率进入加速段，但统计口径仍需拆分</strong></div>'
        f'<svg viewBox="0 0 850 300" role="img" aria-label="AI数据中心液冷采用率趋势图">{grid}<path d="{area}" fill="#2e76c9" opacity=".10"/><path d="{path}" fill="none" stroke="#2e76c9" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>{"".join(marks)}<text x="770" y="280" text-anchor="end" class="note">单位：%；2026E/2027E为机构预测或区间口径</text></svg>'
        '<figcaption>采用率需区分新建AI数据中心、存量改造和特定GPU平台，不能将单一机构样本直接外推至全部数据中心。来源：<code>trendforce-liquid-cooling-2025-08</code>、<code>local-guangfa-2026-05</code>、<code>local-dongwu-2026-06</code>。</figcaption></figure>'
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
    focus = ["英维克", "高澜股份", "申菱环境", "中石科技", "思泉新材"]
    records = {(item["name"], item.get("year")): item for item in data["charts"]["financials"]}

    def value(name: str, year: int, key: str) -> Optional[float]:
        raw = records.get((name, year), {}).get(key)
        return float(raw) if isinstance(raw, (int, float)) else None

    def label_value(raw: Optional[float]) -> str:
        return "—" if raw is None else f"{raw:.1f}"

    def mini_grouped(title: str, key: str, years: Sequence[int], x: int, y: int, width: int, height: int, unit: str) -> str:
        plot_left, plot_top = x + 54, y + 52
        plot_width, plot_height = width - 76, height - 104
        raw_values = [value(name, year, key) for name in focus for year in years]
        maximum = max([item for item in raw_values if item is not None] or [1])
        if key == "gross_margin":
            maximum = max(40.0, maximum)
        maximum *= 1.12
        parts = [f'<g><rect x="{x}" y="{y}" width="{width}" height="{height}" rx="14" fill="#0d2332" stroke="#24485b"/><text x="{x+18}" y="{y+27}" class="chart-title">{title}</text><text x="{x+width-18}" y="{y+27}" text-anchor="end" class="chart-unit">{unit}</text>']
        for grid_index in range(4):
            gy = plot_top + plot_height - grid_index * plot_height / 3
            grid_value = maximum * grid_index / 3
            parts.append(f'<path d="M{plot_left} {gy:.1f}H{plot_left+plot_width}" class="grid"/><text x="{plot_left-8}" y="{gy+4:.1f}" text-anchor="end" class="chart-axis">{grid_value:.0f}</text>')
        group_width = plot_width / len(focus)
        bar_width = min(18, group_width / (len(years) + 1))
        for index, name in enumerate(focus):
            center = plot_left + group_width * (index + .5)
            for year_index, year in enumerate(years):
                raw = value(name, year, key)
                if raw is None:
                    continue
                bar_height = max(2, raw / maximum * plot_height)
                bx = center + (year_index - (len(years)-1)/2) * (bar_width + 4) - bar_width / 2
                by = plot_top + plot_height - bar_height
                color = "#72cfff" if year == 2023 else "#f2783f" if year == 2025 else "#f05a67"
                parts.append(f'<rect x="{bx:.1f}" y="{by:.1f}" width="{bar_width:.1f}" height="{bar_height:.1f}" rx="4" fill="{color}"/><text x="{bx+bar_width/2:.1f}" y="{max(plot_top+11, by-5):.1f}" text-anchor="middle" class="chart-value">{label_value(raw)}</text>')
            parts.append(f'<text x="{center:.1f}" y="{plot_top+plot_height+20}" text-anchor="middle" class="chart-label">{esc(name)}</text>')
        if len(years) > 1:
            legend_x = x + width - 116
            for index, year in enumerate(years):
                color = "#72cfff" if year == 2023 else "#f2783f" if year == 2025 else "#f05a67"
                parts.append(f'<rect x="{legend_x+index*47}" y="{y+40}" width="8" height="8" rx="2" fill="{color}"/><text x="{legend_x+index*47+12}" y="{y+48}" class="chart-legend">{year}</text>')
        parts.append('</g>')
        return "".join(parts)

    def mini_positive(title: str, key: str, x: int, y: int, width: int, height: int, unit: str, signed: bool = False) -> str:
        plot_left, plot_top = x + 54, y + 52
        plot_width, plot_height = width - 76, height - 104
        raw_values = [value(name, 2025, key) for name in focus]
        visible = [item for item in raw_values if item is not None]
        maximum = max(1.0, max(visible or [1]))
        if key in {"gross_margin", "net_margin", "rd_rate"}:
            maximum = max(40.0, maximum)
        maximum *= 1.12
        zero_y = plot_top + plot_height if not signed else plot_top + plot_height / 2
        scale_height = plot_height if not signed else plot_height / 2
        parts = [f'<g><rect x="{x}" y="{y}" width="{width}" height="{height}" rx="14" fill="#0d2332" stroke="#24485b"/><text x="{x+18}" y="{y+27}" class="chart-title">{title}</text><text x="{x+width-18}" y="{y+27}" text-anchor="end" class="chart-unit">{unit}</text>']
        for grid_index in range(4):
            gy = zero_y - grid_index * scale_height / 3
            grid_value = maximum * grid_index / 3
            parts.append(f'<path d="M{plot_left} {gy:.1f}H{plot_left+plot_width}" class="grid"/><text x="{plot_left-8}" y="{gy+4:.1f}" text-anchor="end" class="chart-axis">{grid_value:.0f}</text>')
        if signed:
            parts.append(f'<path d="M{plot_left} {zero_y:.1f}H{plot_left+plot_width}" stroke="#f5f7f9" stroke-opacity=".35"/>')
        group_width = plot_width / len(focus)
        bar_width = min(24, group_width * .46)
        for index, name in enumerate(focus):
            raw = value(name, 2025, key)
            if raw is None:
                continue
            center = plot_left + group_width * (index + .5)
            magnitude = abs(raw) / maximum * scale_height
            if signed and raw < 0:
                by, fill = zero_y, "#f05a67"
            else:
                by, fill = zero_y - magnitude if signed else zero_y - magnitude, "#f2783f" if key != "rd_rate" else "#72cfff"
            parts.append(f'<rect x="{center-bar_width/2:.1f}" y="{by:.1f}" width="{bar_width:.1f}" height="{max(2,magnitude):.1f}" rx="4" fill="{fill}"/><text x="{center:.1f}" y="{max(plot_top+11, by-5):.1f}" text-anchor="middle" class="chart-value">{label_value(raw)}</text><text x="{center:.1f}" y="{plot_top+plot_height+20}" text-anchor="middle" class="chart-label">{esc(name)}</text>')
        parts.append('</g>')
        return "".join(parts)

    svg = '<svg class="financial-dashboard" viewBox="0 0 1120 610" role="img" aria-label="重点公司多维度财务柱状图对比">'
    svg += '<text x="20" y="25" class="axis">FINANCIAL DASHBOARD / 同口径比较公司整体财务表现</text>'
    svg += mini_grouped("营业收入：2023 vs 2025", "revenue", [2023, 2025], 20, 42, 530, 255, "亿元")
    svg += mini_positive("归母净利：2025", "net_profit", 570, 42, 530, 255, "亿元", signed=True)
    svg += mini_grouped("毛利率：2025", "gross_margin", [2025], 20, 320, 530, 255, "%")
    svg += mini_positive("经营现金流：2025", "ocf", 570, 320, 530, 255, "亿元", signed=True)
    svg += '</svg>'
    return (
        '<figure class="figure-card editorial-plate financial-plate"><div class="figure-heading"><span>05 / FINANCIAL DASHBOARD</span><strong>不同公司放在同一组柱状图里，增长、利润与现金流同时验证</strong></div>'
        + svg
        + '<figcaption>图中统一比较英维克、高澜股份、申菱环境、中石科技、思泉新材的公司整体财务；柱顶为对应年度数值。财务数据来自iFinD，不能替代液冷分部口径；高澜股份2023年异常值按台账保留并在正文标注。</figcaption></figure>'
    )


def light_svg(svg: str) -> str:
    """Translate the shared dark SVG palette into the report's light research palette."""
    replacements = {
        "#071522": "#122334",
        "#0c2230": "#f8fafb",
        "#0d2332": "#ffffff",
        "#102c3c": "#f7fafb",
        "#14394c": "#eaf1f4",
        "#16394b": "#e4edf1",
        "#173243": "#dce7ec",
        "#17394b": "#d4e1e7",
        "#21465a": "#d8e4e9",
        "#23485b": "#c8d6dd",
        "#24485b": "#c8d6dd",
        "#a9b7c5": "#63737d",
        "#8fa7b2": "#687983",
        "#c1d0d7": "#43545f",
        "#d7e2e7": "#233744",
        "#f5f7f9": "#122334",
        "#ffd2b5": "#d9532d",
        "#b8eaff": "#2873bd",
        "#72cfff": "#2e76c9",
    }
    for source, target in replacements.items():
        svg = svg.replace(source, target)
    return svg


def editorial_figure(kicker: str, title: str, svg: str, caption: str, classes: str = "") -> str:
    return (
        f'<figure class="figure-card editorial-plate {esc(classes)}">'
        f'<div class="figure-heading"><span>{esc(kicker)}</span><strong>{esc(title)}</strong></div>'
        f'{light_svg(svg)}<figcaption>{caption}</figcaption></figure>'
    )


def chain_atlas_figure(data: Dict[str, Any]) -> str:
    cards = [
        ("01", "材料与工质", "铜 / 铝 / TIM / 工质", "巨化 · 新宙邦 · 中石 · 思泉", "成本变量", "#72cfff"),
        ("02", "芯片侧部件", "冷板 / 微通道 / UQD", "中石 · 思泉 · 中航光电", "价值量 30–45%", "#f2783f"),
        ("03", "机柜级系统", "CDU / Manifold / 泵控", "英维克 · 高澜 · 申菱", "价值量 25–40%", "#f05a67"),
        ("04", "客户应用", "AI机柜 / 超算 / 云数据中心", "NVIDIA生态 · 云厂商 · ODM/OEM", "采购权与验收", "#a9b7c5"),
    ]
    parts = ['<svg viewBox="0 0 1120 510" role="img" aria-label="液冷产业链类实物节点图">', '<defs><linearGradient id="chainFlow" x1="0" x2="1"><stop stop-color="#72cfff"/><stop offset=".48" stop-color="#f2783f"/><stop offset="1" stop-color="#f05a67"/></linearGradient><marker id="chainAtlasArrow" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto"><path d="M0 0L7 4L0 8" fill="#f2783f"/></marker></defs>']
    parts.append('<text x="20" y="31" class="axis">SUPPLY CHAIN ATLAS / 不是四层概念，而是四类可采购硬件</text><text x="1100" y="31" text-anchor="end" class="axis">材料 → 部件 → 系统 → 客户</text>')
    parts.append('<path d="M105 115H1016" stroke="#21465a" stroke-width="15" stroke-linecap="round"/><path d="M105 115H1016" stroke="url(#chainFlow)" stroke-width="3" stroke-dasharray="12 10" marker-end="url(#chainAtlasArrow)"/>')
    for index, (number, title, products, companies, value_note, color) in enumerate(cards):
        x = 20 + index * 275
        center = x + 127
        parts.append(f'<g><rect x="{x}" y="160" width="245" height="246" rx="14" fill="#0d2332" stroke="#24485b"/><rect x="{x}" y="160" width="245" height="7" rx="3" fill="{color}"/><text x="{x+18}" y="193" class="eyebrow">{number} / VALUE NODE</text><text x="{x+18}" y="222" class="route-title">{title}</text>')
        if index == 0:
            parts.append(f'<g transform="translate({center-62} 242)"><rect width="124" height="63" rx="7" fill="#b66b48" stroke="#f1a27b"/><path d="M16 17H108M16 31H108M16 45H108" stroke="#6d342b" stroke-width="4"/><circle cx="19" cy="54" r="4" fill="#f0c1a3"/><circle cx="105" cy="54" r="4" fill="#f0c1a3"/></g>')
        elif index == 1:
            parts.append(f'<g transform="translate({center-62} 242)"><rect width="124" height="63" rx="7" fill="#a96342" stroke="#f1a27b"/><path d="M16 18 C40 6 84 30 108 17 M16 31 C40 19 84 43 108 30 M16 44 C40 32 84 56 108 43" fill="none" stroke="#f2c0a3" stroke-width="3"/><circle cx="20" cy="54" r="5" fill="#14394c"/><circle cx="104" cy="54" r="5" fill="#14394c"/></g>')
        elif index == 2:
            parts.append(f'<g transform="translate({center-58} 232)"><rect width="116" height="84" rx="8" fill="#172a37" stroke="#72cfff"/><circle cx="33" cy="42" r="17" fill="none" stroke="#72cfff" stroke-width="5"/><path d="M33 25V59M16 42H50" stroke="#72cfff" stroke-width="3"/><path d="M78 25H101M78 42H101M78 59H101" stroke="#f2783f" stroke-width="6"/></g>')
        else:
            parts.append(f'<g transform="translate({center-48} 220)"><rect width="96" height="108" rx="8" fill="#111d27" stroke="#a9b7c5"/><path d="M17 26H79M17 48H79M17 70H79M17 92H79" stroke="#72cfff" stroke-width="6"/><circle cx="17" cy="26" r="3" fill="#f2783f"/><circle cx="17" cy="48" r="3" fill="#f2783f"/><circle cx="17" cy="70" r="3" fill="#f2783f"/><circle cx="17" cy="92" r="3" fill="#f2783f"/></g>')
        parts.append(f'<text x="{x+18}" y="346" class="node-title">{esc(products)}</text><text x="{x+18}" y="371" class="node-sub">重点公司：{esc(companies)}</text><rect x="{x+18}" y="382" width="209" height="20" rx="6" fill="#14394c"/><text x="{x+28}" y="396" class="check-label">{esc(value_note)}</text></g>')
        if index < len(cards)-1:
            parts.append(f'<path d="M{x+247} 283h24" stroke="{color}" stroke-width="3" marker-end="url(#chainAtlasArrow)"/>')
    parts.append('<rect x="20" y="435" width="1080" height="45" rx="9" fill="#102c3c" stroke="#24485b"/><text x="38" y="462" class="note">研究跟踪：材料成本看毛利传导；冷板/UQD看平台认证与良率；CDU看订单、验收与应收；下游看机柜kW、客户资本开支与液冷渗透。</text></svg>')
    return editorial_figure("06 / SUPPLY CHAIN ATLAS", "把产业链画成可触摸的四类硬件：价值量、采购权与验证变量", "".join(parts), "图示把产业链从抽象分层改为四类可采购对象；价值量区间仅为机构研究常见口径，需按项目边界和是否含工程服务核验。", "figure-chain")


def sankey_supply_chain_figure(data: Dict[str, Any]) -> str:
    """Show the supply chain as a value-flow map, closer to an equity-research atlas than a table."""
    parts = ['<svg viewBox="0 0 1240 720" role="img" aria-label="液冷产业链价值流量图">']
    parts.append('<defs><linearGradient id="sankeyBlue" x1="0" x2="1"><stop stop-color="#2f7cf6"/><stop offset="1" stop-color="#6aa9ff"/></linearGradient><linearGradient id="sankeyOrange" x1="0" x2="1"><stop stop-color="#ff6b38"/><stop offset="1" stop-color="#ff9b5d"/></linearGradient><linearGradient id="sankeySlate" x1="0" x2="1"><stop stop-color="#91a7b5"/><stop offset="1" stop-color="#c7d3d9"/></linearGradient><marker id="sankeyArrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0L8 5L0 10" fill="#667985"/></marker></defs>')
    parts.append('<text x="20" y="34" class="atlas-title">SUPPLY CHAIN ATLAS / SUPPLY CHAIN VALUE FLOW / 从材料到算力机柜</text><text x="1220" y="34" text-anchor="end" class="atlas-note">图中比例用于价值量和采购权的结构化理解，不代表市场份额</text>')
    metrics = [("CDU / 基础设施", "核心配置", "价值量约 25–40%", "英维克 · 高澜 · 申菱", "#ff6b38"), ("冷板 / TIM", "平台弹性", "价值量约 30–45%", "中石科技 · 思泉新材", "#2f7cf6"), ("UQD / 流体接口", "卡位观察", "价值量约 3–10%", "中航光电 · 飞龙股份", "#667985")]
    for index, (title, subtitle, detail, companies, color) in enumerate(metrics):
        x = 20 + index * 400
        parts.append(f'<rect x="{x}" y="62" width="370" height="90" rx="16" fill="#ffffff" stroke="#d8e3e8"/><rect x="{x}" y="62" width="8" height="90" rx="4" fill="{color}"/><text x="{x+24}" y="94" class="metric-title">{title}</text><text x="{x+24}" y="118" class="metric-sub">{subtitle} · {detail}</text><text x="{x+24}" y="140" class="metric-companies">重点：{companies}</text>')
    parts.append('<text x="32" y="204" class="column-title">上游 / 材料与设备</text><text x="424" y="204" class="column-title">中游 / 部件与系统</text><text x="872" y="204" class="column-title">下游 / 应用与采购</text>')
    # Flow bands: the width is intentionally different so the reader sees where value and procurement concentrate.
    flow_paths = [
        ('M245 260 C330 260 336 255 430 255', 64, 'url(#sankeyBlue)'),
        ('M245 315 C330 315 340 344 430 344', 46, 'url(#sankeyOrange)'),
        ('M245 370 C332 370 350 430 430 430', 28, 'url(#sankeySlate)'),
        ('M245 425 C340 425 350 480 430 480', 20, 'url(#sankeySlate)'),
        ('M755 282 C825 282 835 265 910 265', 58, 'url(#sankeyOrange)'),
        ('M755 350 C832 350 840 345 910 345', 46, 'url(#sankeyBlue)'),
        ('M755 415 C830 415 842 425 910 425', 30, 'url(#sankeySlate)'),
        ('M755 480 C830 480 845 510 910 510', 20, 'url(#sankeySlate)'),
    ]
    for path, width, stroke in flow_paths:
        parts.append(f'<path d="{path}" fill="none" stroke="{stroke}" stroke-width="{width}" stroke-linecap="round" opacity=".86"/>')
    upstream = [
        ("铜 / 铝 / 钎料", "冷板、管路成本", 228, "材料价格 · 调价机制"),
        ("TIM / 密封 / 工质", "热阻与兼容性", 283, "配方认证 · 合规"),
        ("泵 / 板换 / 检测", "系统可靠性", 338, "设备进场 · 良率"),
        ("精密加工设备", "产能与交付", 393, "CNC · 钎焊 · 氦检"),
    ]
    for title, subtitle, y, note in upstream:
        parts.append(f'<rect x="20" y="{y}" width="225" height="42" rx="10" fill="#ffffff" stroke="#d8e3e8"/><text x="36" y="{y+18}" class="node-title-dark">{title}</text><text x="36" y="{y+34}" class="node-sub-dark">{subtitle} · {note}</text>')
    middle = [
        ("冷板 / 微通道", "平台认证 · 单位毛利", 224, "中石科技 · 思泉新材"),
        ("CDU / 换热泵控", "系统交付 · 验收回款", 304, "英维克 · 高澜 · 申菱"),
        ("UQD / Manifold", "泄漏 · 寿命 · 流量均匀", 384, "中航光电 · 飞龙股份"),
        ("系统集成 / 运维", "一次侧 · 二次侧 · 维保", 464, "曙光数创 · Vertiv"),
    ]
    for title, subtitle, y, companies in middle:
        parts.append(f'<rect x="430" y="{y}" width="325" height="58" rx="14" fill="#ffffff" stroke="#cbd9e0"/><rect x="430" y="{y}" width="7" height="58" rx="3" fill="#2f7cf6"/><text x="452" y="{y+23}" class="node-title-dark">{title}</text><text x="452" y="{y+42}" class="node-sub-dark">{subtitle} · {companies}</text>')
    downstream = [
        ("AI高密度机柜", "机柜kW · 液冷渗透", 234, "云厂商 / 服务器ODM"),
        ("超算与智算中心", "项目验收 · PUE", 314, "运营商 / 政企客户"),
        ("储能与新能源", "成本 · 安全 · 交付", 394, "系统集成商"),
        ("汽车与工业热管理", "跨场景工艺迁移", 474, "Tier 1 / 工业客户"),
    ]
    for title, subtitle, y, companies in downstream:
        parts.append(f'<rect x="910" y="{y}" width="300" height="58" rx="14" fill="#ffffff" stroke="#d8e3e8"/><rect x="910" y="{y}" width="7" height="58" rx="3" fill="#ff6b38"/><text x="932" y="{y+23}" class="node-title-dark">{title}</text><text x="932" y="{y+42}" class="node-sub-dark">{subtitle} · {companies}</text>')
    parts.append('<path d="M40 612H1200" stroke="#d8e3e8" stroke-width="2"/><text x="40" y="646" class="atlas-note">投资读法：价值量看冷板/CDU，认证权看平台与UQD，订单能见度看系统交付，业绩质量最终看毛利、应收和经营现金流。</text><text x="40" y="675" class="atlas-note">图示公司为研究池，不代表完整市场份额；价值量区间来自公开机构研究，系统边界和项目模式会改变比例。</text></svg>')
    return editorial_figure("06 / SUPPLY CHAIN VALUE FLOW", "用流量而不是表格理解产业链：钱、货与采购权如何流动", "".join(parts), "产业链图采用参考图2式的流量带和节点卡片，先建立环节之间的关系，再回到公司、价值量和验证指标。", "figure-sankey")


def technology_routes_figure() -> str:
    routes = [
        ("01", "冷板式液冷", "当前主流", "芯片 → TIM → 冷板 → CDU", "AI服务器 / 高密度机柜", "冷板 + CDU + UQD", "#f2783f"),
        ("02", "单相浸没式", "场景化成长", "设备 → 介电液 → 换热器", "超算 / 特定AI集群", "工质 + 罐体 + 运维", "#72cfff"),
        ("03", "两相浸没 / 喷淋", "验证期", "相变 / 直接接触 → 冷凝", "极高热流密度场景", "工质 + 密封 + 合规", "#f05a67"),
    ]
    parts = ['<svg viewBox="0 0 1120 480" role="img" aria-label="液冷技术路线对比图">', '<defs><linearGradient id="routeFlow" x1="0" x2="1"><stop stop-color="#f05a67"/><stop offset=".5" stop-color="#f2783f"/><stop offset="1" stop-color="#72cfff"/></linearGradient></defs>']
    parts.append('<path d="M66 91C270 28 417 137 566 82S866 31 1056 98" fill="none" stroke="#21465a" stroke-width="24"/><path d="M66 91C270 28 417 137 566 82S866 31 1056 98" fill="none" stroke="url(#routeFlow)" stroke-width="5" stroke-dasharray="12 10"/><text x="20" y="31" class="axis">TECHNOLOGY MAP / 热流路径决定采购环节</text><text x="20" y="53" class="note">路线选择不是“谁更先进”，而是由热流密度、改造难度、工质合规和维护方式共同决定。</text>')
    for index, (number, name, phase, path, scene, value, color) in enumerate(routes):
        x = 20 + index * 366
        parts.append(f'<rect x="{x}" y="155" width="340" height="250" rx="16" fill="#102c3c" stroke="#23485b"/><rect x="{x}" y="155" width="340" height="7" rx="3" fill="{color}"/><text x="{x+22}" y="194" class="eyebrow">ROUTE {number}</text><text x="{x+22}" y="230" class="route-title">{name}</text><text x="{x+22}" y="252" fill="{color}" class="route-phase">{phase}</text>')
        parts.append(f'<rect x="{x+22}" y="278" width="296" height="42" rx="9" fill="#14394c"/><text x="{x+38}" y="304" class="node-title">{esc(path)}</text>')
        parts.append(f'<text x="{x+22}" y="350" class="node-sub">典型场景</text><text x="{x+92}" y="350" class="node-title">{esc(scene)}</text><text x="{x+22}" y="378" class="node-sub">价值抓手</text><text x="{x+92}" y="378" class="node-title">{esc(value)}</text>')
    parts.append('</svg>')
    return editorial_figure("03 / TECHNOLOGY ROUTES", "三条路线：主流、场景化与验证期", "".join(parts), "科普重点是理解每条路线的热流路径、部署场景和价值抓手；冷板式当前更适合作为主线研究对象。", "figure-routes")


def manufacturing_figure() -> str:
    steps = [
        ("01", "材料", "铜 / 铝 / 焊料", "导热与兼容"),
        ("02", "流道成型", "CNC / 冲压 / 蚀刻", "尺寸与均匀性"),
        ("03", "清洗准备", "洁净 / 涂钎料", "残留与润湿"),
        ("04", "焊接成型", "真空钎焊 / 扩散焊", "变形与良率"),
        ("05", "氦检", "零泄漏测试", "可靠性门槛"),
        ("06", "热流测试", "热阻 / 流阻 / 平面度", "平台认证"),
        ("07", "量产交付", "追溯 / 复检 / 维护", "客户回款"),
    ]
    parts = ['<svg viewBox="0 0 1120 350" role="img" aria-label="冷板制造工艺流程图">', '<defs><linearGradient id="processFlow" x1="0" x2="1"><stop stop-color="#72cfff"/><stop offset=".5" stop-color="#f2783f"/><stop offset="1" stop-color="#f05a67"/></linearGradient><marker id="processArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="#f2783f"/></marker></defs>', '<text x="20" y="31" class="axis">MANUFACTURING RIBBON / 冷板不是“做出来”，而是“测出来”</text>', '<path d="M50 145H1072" stroke="#23485b" stroke-width="4" marker-end="url(#processArrow)"/>']
    for index, (number, title, detail, check) in enumerate(steps):
        x = 20 + index * 156
        color = "#72cfff" if index < 3 else "#f2783f" if index < 6 else "#f05a67"
        parts.append(f'<circle cx="{x+52}" cy="145" r="30" fill="#102c3c" stroke="{color}" stroke-width="3"/><text x="{x+52}" y="150" text-anchor="middle" class="step-number">{number}</text><text x="{x+52}" y="207" text-anchor="middle" class="step-title">{esc(title)}</text><text x="{x+52}" y="230" text-anchor="middle" class="node-sub">{esc(detail)}</text><rect x="{x+5}" y="264" width="112" height="32" rx="8" fill="#14394c"/><text x="{x+61}" y="285" text-anchor="middle" class="check-label">{esc(check)}</text>')
    parts.append('<text x="20" y="332" class="note">设备与耗材：CNC / 真空钎焊炉 / 氦质谱检漏 / 点胶涂覆 / 三坐标检测。高端产能的瓶颈通常是认证良率，不是名义产能。</text></svg>')
    return editorial_figure("07 / MANUFACTURING RIBBON", "从流道成型到客户认证：制造工艺的七个关口", "".join(parts), "制造工艺图把“设备、耗材、测试和认证”放到一条生产带上，便于理解为什么扩产不等于高端产能。", "figure-manufacturing")


def commercial_loop_figure() -> str:
    phases = [("认证", 190, 100, "平台 / 客户"), ("样品", 430, 72, "小批验证"), ("量产", 690, 100, "订单放量"), ("回款", 845, 250, "验收 / 现金"), ("维保", 570, 345, "替换 / 服务")]
    parts = ['<svg viewBox="0 0 1120 470" role="img" aria-label="液冷商业模式生命周期闭环图">', '<defs><marker id="loopArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="#f2783f"/></marker></defs>', '<text x="20" y="31" class="axis">BUSINESS MODEL LOOP / 一次设备收入只是起点</text>', '<circle cx="560" cy="225" r="112" fill="#102c3c" stroke="#f2783f" stroke-width="2" stroke-dasharray="6 8"/><circle cx="560" cy="225" r="72" fill="#14394c" stroke="#72cfff"/><text x="560" y="216" text-anchor="middle" class="route-title">生命周期价值</text><text x="560" y="241" text-anchor="middle" class="node-sub">设备 + 服务 + 替换</text>']
    for index in range(len(phases)):
        x1, y1 = phases[index][1], phases[index][2]
        x2, y2 = phases[(index + 1) % len(phases)][1], phases[(index + 1) % len(phases)][2]
        parts.append(f'<path d="M{x1} {y1} Q560 225 {x2} {y2}" fill="none" stroke="#f2783f" stroke-width="2" marker-end="url(#loopArrow)" opacity=".8"/>')
    for index, (name, x, y, detail) in enumerate(phases):
        parts.append(f'<g transform="translate({x-58} {y-27})"><rect width="116" height="54" rx="10" fill="#102c3c" stroke="#72cfff"/><text x="58" y="23" text-anchor="middle" class="node-title">{name}</text><text x="58" y="42" text-anchor="middle" class="node-sub">{detail}</text></g>')
    cards = [("CDU / 系统", "项目交付 + 维保", "验收周期 / 应收", "#f2783f"), ("冷板 / TIM", "平台认证 + 量产", "良率 / 单位毛利", "#72cfff"), ("UQD", "精密制造 + 认证", "寿命 / 泄漏", "#f05a67"), ("工质", "配方合规 + 供货", "测试 / 复购", "#a9b7c5")]
    for index, (name, model, risk, color) in enumerate(cards):
        x = 20 + index * 270
        parts.append(f'<rect x="{x}" y="395" width="244" height="48" rx="9" fill="#14394c" stroke="{color}"/><text x="{x+14}" y="416" class="node-title">{name}</text><text x="{x+14}" y="435" class="node-sub">{model} · 看 {risk}</text>')
    parts.append('</svg>')
    return editorial_figure("12 / COMMERCIAL MODEL", "认证、量产、交付、回款与维保构成真正的商业闭环", "".join(parts), "不同环节的收入确认点不同：CDU重验收回款，冷板/TIM重平台认证与良率，UQD重可靠性，工质重测试与复购。", "figure-commercial")


def tracking_quadrant_figure() -> str:
    quadrants = [
        ("01", "需求", "TDP / 机柜kW / 液冷渗透率", "判断必要性", "#72cfff"),
        ("02", "订单", "BOM / 在手订单 / 合同负债", "判断能见度", "#f2783f"),
        ("03", "供给", "认证产能 / 良率 / 交付周期", "判断兑现能力", "#f05a67"),
        ("04", "财务", "毛利 / 应收 / 存货 / OCF", "判断增长质量", "#a9b7c5"),
    ]
    parts = ['<svg viewBox="0 0 1120 410" role="img" aria-label="液冷行业跟踪体系四象限图">', '<text x="20" y="31" class="axis">TRACKING SYSTEM / 每个季度只问四个问题</text>', '<path d="M560 75V350M180 212H940" stroke="#23485b" stroke-width="2" stroke-dasharray="5 8"/>']
    positions = [(28, 64), (590, 64), (28, 246), (590, 246)]
    for (number, title, metrics, conclusion, color), (x, y) in zip(quadrants, positions):
        parts.append(f'<rect x="{x}" y="{y}" width="500" height="130" rx="14" fill="#102c3c" stroke="#23485b"/><circle cx="{x+34}" cy="{y+35}" r="18" fill="{color}"/><text x="{x+34}" y="{y+40}" text-anchor="middle" class="step-number">{number}</text><text x="{x+70}" y="{y+41}" class="route-title">{title}</text><text x="{x+70}" y="{y+72}" class="node-title">{esc(metrics)}</text><text x="{x+70}" y="{y+101}" class="node-sub">{esc(conclusion)}</text>')
    parts.append('<rect x="415" y="180" width="290" height="64" rx="32" fill="#f2783f"/><text x="560" y="208" text-anchor="middle" class="center-title">业绩与估值验证</text><text x="560" y="230" text-anchor="middle" class="center-sub">订单 → 收入 → 利润 → 现金</text></svg>')
    return editorial_figure("02 / TRACKING QUADRANT", "需求、订单、供给、财务：跟踪体系的四个入口", "".join(parts), "把宏观景气和公司财务放在同一张图上，避免只看订单或只看概念。", "figure-tracking")


def catalyst_timeline_figure() -> str:
    stages = [("平台发布", "技术规格", "2025—2026", "#72cfff"), ("客户认证", "样品 / 小批", "持续发生", "#72cfff"), ("批量交付", "订单 / 出货", "2026H2—2027", "#f2783f"), ("财务兑现", "利润 / 回款", "季度验证", "#f05a67"), ("估值重估", "分部贡献", "条件触发", "#a9b7c5")]
    parts = ['<svg viewBox="0 0 1120 300" role="img" aria-label="液冷行业催化剂验证时间轴">', '<text x="20" y="31" class="axis">CATALYST TIMELINE / 催化剂需要跨过三道门</text>', '<path d="M92 128H1030" stroke="#23485b" stroke-width="4"/>']
    for index, (title, detail, period, color) in enumerate(stages):
        x = 110 + index * 215
        parts.append(f'<circle cx="{x}" cy="128" r="22" fill="#102c3c" stroke="{color}" stroke-width="4"/><text x="{x}" y="134" text-anchor="middle" class="step-number">0{index+1}</text><text x="{x}" y="190" text-anchor="middle" class="route-title">{title}</text><text x="{x}" y="215" text-anchor="middle" class="node-title">{detail}</text><text x="{x}" y="239" text-anchor="middle" class="node-sub">{period}</text>')
        if index < len(stages)-1:
            parts.append(f'<path d="M{x+25} 128h156" stroke="{color}" stroke-width="3" stroke-dasharray="7 8"/>')
    parts.append('<text x="20" y="280" class="note">最强验证：客户认证 → 稳定量产 → 收入、毛利和经营现金流同步改善。</text></svg>')
    return editorial_figure("14 / CATALYST TIMELINE", "从平台催化到估值验证：不要跳过量产与回款", "".join(parts), "催化剂不是公告清单，而是一条必须逐级兑现的验证链。", "figure-catalyst")


def figure_assets(data: Dict[str, Any]) -> Dict[str, str]:
    figures = {
        "assets/01_technology_routes.svg": technology_routes_figure(),
        "assets/02_supply_chain_atlas.svg": sankey_supply_chain_figure(data),
        "assets/03_tracking_quadrant.svg": tracking_quadrant_figure(),
        "assets/04_manufacturing_ribbon.svg": manufacturing_figure(),
        "assets/05_commercial_model_loop.svg": commercial_loop_figure(),
        "assets/06_catalyst_timeline.svg": catalyst_timeline_figure(),
        "assets/07_penetration_curve.svg": penetration_figure(data),
        "assets/08_financial_dashboard.svg": financial_figure(data),
    }
    extracted: Dict[str, str] = {}
    for path, figure in figures.items():
        match = re.search(r"(<svg\b.*?</svg>)", figure, re.S)
        if match:
            extracted[path] = light_svg(match.group(1))
    return extracted


def write_figure_assets(asset_svgs: Dict[str, str], asset_dir: Path) -> None:
    asset_dir.mkdir(parents=True, exist_ok=True)
    for relative_path, svg in asset_svgs.items():
        (asset_dir / Path(relative_path).name).write_text(svg, encoding="utf-8")


def read_image_assets(asset_dir: Path) -> Dict[str, str]:
    """Inline local raster assets so the generated HTML remains standalone."""
    assets: Dict[str, str] = {}
    for name in ("01_rack_cutaway.jpg", "02_component_board.jpg", "03_datacenter_scene.jpg"):
        path = asset_dir / name
        if not path.exists():
            continue
        mime = mimetypes.guess_type(path.name)[0] or "image/png"
        encoded = base64.b64encode(path.read_bytes()).decode("ascii")
        assets[f"assets/{name}"] = f"data:{mime};base64,{encoded}"
    return assets


def hardware_board(asset_images: Dict[str, str]) -> str:
    def image(path: str, alt: str) -> str:
        source = asset_images.get(path, path)
        return f'<img src="{source}" alt="{esc(alt)}">'

    return f'''
    <section class="hardware-board" aria-label="液冷硬件实物视角图板">
      <div class="board-head"><div><span class="section-kicker">HARDWARE BOARD / 类实物视角</span><h3>先看设备，再看价值量：液冷系统的采购边界</h3></div><p>生成图用于建立硬件直觉；产品标签、环节归属和公司映射以正文数据与来源台账为准。</p></div>
      <div class="hardware-grid">
        <figure class="hardware-card hardware-rack">
          <div class="hardware-media">{image("assets/01_rack_cutaway.jpg", "液冷AI服务器机柜剖视示意")}
            <span class="hardware-callout callout-heat">芯片热源</span><span class="hardware-callout callout-plate">冷板 / TIM</span><span class="hardware-callout callout-uqd">UQD / 快接</span><span class="hardware-callout callout-cdu">CDU</span>
          </div>
          <div class="hardware-caption"><strong>01 / 机柜剖视</strong><span>热量路径从芯片侧延伸至设施侧，系统价值集中在“接热、带热、换热、维护”四个动作。</span></div>
        </figure>
        <figure class="hardware-card hardware-components">
          <div class="hardware-media">{image("assets/02_component_board.jpg", "液冷核心部件产品图板")}</div>
          <div class="hardware-caption"><strong>02 / 核心部件</strong><span>冷板看热阻与良率；CDU看系统交付；UQD看认证与可靠性；歧管看流量均匀性。</span></div>
          <div class="component-tags"><span>冷板 / 价值量高</span><span>CDU / 订单前置</span><span>UQD / 失效代价高</span><span>Manifold / 系统一致性</span></div>
        </figure>
      </div>
      <figure class="hardware-card hardware-facility">
        <div class="hardware-media">{image("assets/03_datacenter_scene.jpg", "液冷数据中心应用场景")}
          <span class="facility-label facility-left">一次侧 / 二次侧</span><span class="facility-label facility-right">机柜级交付与运维</span>
        </div>
        <div class="hardware-caption"><strong>03 / 数据中心现场</strong><span>下游客户买的不是单一零件，而是可验收、可维护、可扩容的热管理基础设施。</span></div>
      </figure>
    </section>
    '''


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


def build_html(markdown: str, data: Dict[str, Any], asset_svgs: Optional[Dict[str, str]] = None, asset_images: Optional[Dict[str, str]] = None) -> str:
    body, navigation = render_markdown(markdown, asset_svgs, asset_images)
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
    :root {{ --ink:#142332; --ink-2:#243644; --panel:#ffffff; --panel-2:#eef3f5; --line:#d4dfe4; --text:#142332; --muted:#61727c; --orange:#ef6437; --coral:#c84557; --cyan:#2e76c9; --cream:#fff8ed; --paper:#f4f1eb; --shadow:0 18px 42px rgba(25,54,72,.12); }}
    * {{ box-sizing:border-box; }}
    html {{ scroll-behavior:smooth; }}
    body {{ margin:0; background:var(--paper); color:var(--text); font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif; line-height:1.68; }}
    body::before {{ content:""; position:fixed; inset:0; pointer-events:none; opacity:.05; background-image:radial-gradient(rgba(20,35,50,.22) .7px, transparent .7px); background-size:17px 17px; }}
    a {{ color:var(--cyan); text-decoration:none; }} a:hover {{ color:#14549c; }}
    code {{ font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:.82em; color:#b44b27; background:rgba(239,100,55,.10); padding:.18em .42em; border-radius:4px; }}
    .app-shell {{ display:grid; grid-template-columns:260px minmax(0,1fr); min-height:100vh; }}
    .rail {{ position:sticky; top:0; height:100vh; padding:27px 21px; border-right:1px solid var(--line); background:rgba(255,255,255,.92); backdrop-filter:blur(16px); z-index:8; }}
    .brand {{ display:flex; align-items:center; gap:11px; margin-bottom:30px; }}
    .brand-mark {{ width:32px; height:32px; border-radius:10px; background:linear-gradient(135deg,var(--cyan),var(--orange) 62%,var(--coral)); box-shadow:0 0 24px rgba(242,120,63,.28); }}
    .brand strong {{ display:block; font-family:Georgia,"Noto Serif SC",serif; letter-spacing:.02em; }} .brand small {{ color:var(--muted); font-size:10px; letter-spacing:.16em; }}
    .rail-label {{ color:var(--muted); font:10px ui-monospace,monospace; letter-spacing:.15em; margin:23px 0 10px; }}
    .nav {{ display:grid; gap:4px; max-height:calc(100vh - 190px); overflow:auto; scrollbar-width:thin; }}
    .nav a {{ display:flex; gap:10px; align-items:center; padding:8px 8px; border-radius:6px; color:var(--muted); font-size:12px; transition:.2s ease; }}
    .nav a:hover {{ color:var(--text); background:rgba(46,118,201,.08); transform:translateX(2px); }} .nav a span {{ color:var(--orange); font:10px ui-monospace,monospace; width:22px; }}
    .rail-footer {{ position:absolute; bottom:26px; color:#6e8997; font:10px ui-monospace,monospace; line-height:1.5; }}
    main {{ min-width:0; }}
    .hero {{ position:relative; overflow:hidden; min-height:600px; padding:58px clamp(28px,7vw,110px) 48px; background:radial-gradient(circle at 82% 5%, rgba(239,100,55,.12), transparent 28%), radial-gradient(circle at 10% 42%, rgba(46,118,201,.10), transparent 33%), linear-gradient(135deg,#ffffff 0%,#f1f5f6 68%); border-bottom:1px solid var(--line); }}
    .hero::after {{ content:""; position:absolute; width:350px; height:350px; border:1px solid rgba(46,118,201,.18); border-radius:50%; right:8%; top:80px; box-shadow:0 0 0 26px rgba(46,118,201,.03),0 0 0 52px rgba(239,100,55,.025); }}
    .hero-content {{ position:relative; z-index:1; max-width:1160px; margin:auto; }}
    .eyebrow, .hero-kicker {{ display:inline-block; font:11px ui-monospace,monospace; text-transform:uppercase; letter-spacing:.17em; color:var(--cyan); }}
    .hero h1 {{ max-width:880px; margin:17px 0 14px; color:var(--ink); font:700 clamp(39px,6vw,76px)/1.03 Georgia,"Noto Serif SC",serif; letter-spacing:-.055em; }}
    .hero h1 em {{ color:var(--orange); font-style:normal; }} .hero-subtitle {{ max-width:730px; color:#52636d; font-size:16px; margin:0; }}
    .thermal-ribbon {{ display:block; position:absolute; width:min(800px,72vw); right:-15px; top:40px; opacity:.42; z-index:0; }}
    .hero-meta {{ display:flex; flex-wrap:wrap; gap:11px; margin:29px 0 30px; }} .meta-chip {{ color:#5c6d77; border:1px solid #ccd9df; background:rgba(255,255,255,.78); padding:7px 10px; border-radius:5px; font:11px ui-monospace,monospace; }} .meta-chip strong {{ color:var(--text); }}
    .stats {{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; max-width:1020px; }} .stat-card {{ padding:16px 17px; background:rgba(255,255,255,.88); border:1px solid #d6e1e5; border-radius:7px; box-shadow:var(--shadow); }} .stat-card span {{ display:block; color:var(--muted); font:10px ui-monospace,monospace; letter-spacing:.12em; }} .stat-card strong {{ display:block; margin:7px 0 2px; font:700 27px Georgia,"Noto Serif SC",serif; }} .stat-card small {{ color:#6d7c84; font-size:11px; }} .tone-orange strong {{ color:var(--orange); }} .tone-cyan strong {{ color:var(--cyan); }} .tone-coral strong {{ color:var(--coral); }}
    .hero-note {{ margin:24px 0 0; max-width:960px; color:#61727c; font-size:12px; }}
    .canvas {{ max-width:1160px; margin:0 auto; padding:46px clamp(22px,5vw,75px) 86px; background:rgba(255,255,255,.42); }}
    .section-kicker {{ margin:0 0 8px; color:var(--orange); font:11px ui-monospace,monospace; letter-spacing:.15em; }} .canvas h2, .article h2 {{ font:700 31px/1.16 Georgia,"Noto Serif SC",serif; letter-spacing:-.03em; margin:0 0 12px; }}
    .canvas-intro {{ color:var(--muted); margin:0 0 25px; max-width:800px; }}
    .segment-grid {{ display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin:22px 0 30px; }} .segment-card {{ display:grid; grid-template-columns:42px 1fr; gap:12px; padding:19px; background:#ffffff; border:1px solid #d4dfe4; border-top:3px solid var(--orange); border-radius:5px; min-height:210px; box-shadow:0 12px 28px rgba(35,59,72,.07); }} .segment-rank {{ display:flex; align-items:flex-start; justify-content:center; color:var(--orange); font:24px Georgia,serif; }} .segment-card h3 {{ margin:6px 0 6px; font-size:19px; }} .segment-card p {{ margin:0; color:var(--muted); font-size:12px; line-height:1.65; }} .company-tags {{ display:flex; flex-wrap:wrap; gap:6px; margin-top:16px; }} .company-tags span {{ color:#38515f; background:#eff5f7; border:1px solid #d5e4e9; padding:3px 7px; border-radius:4px; font-size:10px; }}
    .priority-panel {{ padding:17px 20px; border-left:3px solid var(--orange); background:#fff8ef; margin:20px 0 35px; }} .priority-row {{ display:grid; grid-template-columns:90px minmax(180px,260px) 1fr; gap:14px; padding:10px 0; border-bottom:1px solid rgba(92,114,124,.16); align-items:start; }} .priority-row:last-child {{ border-bottom:0; }} .priority-row span {{ color:var(--orange); font:10px ui-monospace,monospace; letter-spacing:.12em; }} .priority-row strong {{ font-size:14px; }} .priority-row em {{ font-style:normal; color:var(--muted); font-size:12px; }}
    .signal-grid {{ display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin:25px 0 46px; }} .signal-card {{ padding:17px; background:#ffffff; border:1px solid #d4dfe4; border-radius:5px; box-shadow:0 10px 24px rgba(35,59,72,.05); }} .signal-card h3 {{ margin:0 0 8px; font-size:14px; }} .signal-card ul {{ margin:0; padding-left:17px; color:var(--muted); font-size:12px; }} .signal-card li::marker {{ color:var(--orange); }}
    .hardware-board {{ margin:36px 0 52px; padding:24px; background:#ffffff; border:1px solid #d4dfe4; border-top:3px solid var(--orange); box-shadow:var(--shadow); }} .board-head {{ display:flex; justify-content:space-between; gap:24px; align-items:end; margin-bottom:18px; }} .board-head h3 {{ margin:4px 0 0; color:var(--ink); font:700 24px/1.25 Georgia,"Noto Serif SC",serif; }} .board-head p {{ max-width:430px; margin:0; color:var(--muted); font-size:11px; line-height:1.65; }} .hardware-grid {{ display:grid; grid-template-columns:1.22fr .78fr; gap:14px; }} .hardware-card {{ margin:0; min-width:0; overflow:hidden; background:#142332; border:1px solid #c9d7de; border-radius:5px; }} .hardware-media {{ position:relative; overflow:hidden; background:#142332; }} .hardware-media img {{ display:block; width:100%; height:auto; aspect-ratio:3/2; object-fit:cover; filter:saturate(.88) contrast(1.04); }} .hardware-caption {{ display:grid; grid-template-columns:130px 1fr; gap:13px; padding:13px 15px 15px; border-top:1px solid rgba(114,207,255,.16); }} .hardware-caption strong {{ color:#ff9b5d; font:10px ui-monospace,monospace; letter-spacing:.12em; }} .hardware-caption span {{ color:#d4e0e5; font-size:12px; line-height:1.6; }} .hardware-callout, .facility-label {{ position:absolute; padding:5px 8px; color:#142332; background:var(--cream); border-left:3px solid var(--orange); font:700 10px ui-monospace,monospace; box-shadow:0 7px 20px rgba(0,0,0,.28); }} .callout-heat {{ left:8%; top:17%; }} .callout-plate {{ right:26%; top:28%; }} .callout-uqd {{ right:30%; top:45%; border-left-color:var(--cyan); }} .callout-cdu {{ left:9%; bottom:20%; border-left-color:var(--cyan); }} .facility-label {{ bottom:10%; }} .facility-left {{ left:5%; border-left-color:var(--cyan); }} .facility-right {{ right:5%; border-left-color:var(--coral); }} .component-tags {{ display:flex; flex-wrap:wrap; gap:6px; padding:0 15px 15px; }} .component-tags span {{ padding:5px 7px; border:1px solid #2b5264; color:#b8eaff; font:10px ui-monospace,monospace; }} .hardware-facility {{ margin-top:14px; }} .hardware-facility .hardware-media img {{ aspect-ratio:2.55/1; object-position:center 58%; }}
    .visual-stack {{ display:grid; gap:18px; margin:25px 0 56px; }} .figure-card {{ margin:0; padding:20px 21px 17px; background:#ffffff; border:1px solid #d4dfe4; border-radius:5px; box-shadow:0 14px 34px rgba(35,59,72,.08); }} .editorial-plate {{ border-radius:5px; border-left:3px solid var(--orange); }} .md-figure {{ margin:32px 0 44px; padding:24px 18px 18px; }} .md-figure-svg {{ overflow-x:auto; scrollbar-width:thin; }} .figure-heading {{ display:flex; justify-content:space-between; align-items:baseline; gap:15px; margin-bottom:13px; }} .figure-heading span {{ color:var(--orange); font:10px ui-monospace,monospace; letter-spacing:.14em; }} .figure-heading strong {{ color:var(--ink); font:18px Georgia,"Noto Serif SC",serif; }} .figure-card svg {{ display:block; width:100%; height:auto; overflow:visible; }} .figure-card svg text {{ fill:#122334; font-family:ui-sans-serif,"Noto Sans SC",sans-serif; font-size:13px; }} .figure-card svg .grid {{ stroke:#cbd8de; fill:none; stroke-width:1; }} .figure-card svg .label {{ fill:#233744; font-size:12px; }} .figure-card svg .axis, .figure-card svg .note {{ fill:#63737d; font-size:11px; }} .figure-card svg .eyebrow {{ fill:#ef6437; font:10px ui-monospace,monospace; letter-spacing:.12em; }} .figure-card svg .value-label {{ fill:#d9532d; font:11px ui-monospace,monospace; }} .figure-card svg .value-label.low {{ fill:#2873bd; }} .figure-card svg .cell {{ font:11px ui-monospace,monospace; }} .figure-card svg .route-title, .figure-card svg .center-title {{ fill:#122334; font:700 18px Georgia,"Noto Serif SC",serif; }} .figure-card svg .center-sub {{ fill:#122334; font:11px ui-monospace,monospace; }} .figure-card svg .step-number {{ fill:#122334; font:700 11px ui-monospace,monospace; }} .figure-card svg .step-title {{ fill:#122334; font-size:14px; font-weight:700; }} .figure-card svg .check-label {{ fill:#2873bd; font:10px ui-monospace,monospace; }} .figure-card svg .atlas-title {{ fill:#122334; font:700 15px Georgia,"Noto Serif SC",serif; }} .figure-card svg .atlas-note {{ fill:#687983; font:10px ui-monospace,monospace; }} .figure-card svg .column-title {{ fill:#122334; font:700 15px Georgia,"Noto Serif SC",serif; }} .figure-card svg .metric-title {{ fill:#122334; font:700 16px Georgia,"Noto Serif SC",serif; }} .figure-card svg .metric-sub, .figure-card svg .metric-companies {{ fill:#52636d; font-size:11px; }} .figure-card svg .node-title-dark {{ fill:#122334; font:700 13px ui-sans-serif,"Noto Sans SC",sans-serif; }} .figure-card svg .node-sub-dark {{ fill:#63737d; font-size:10px; }} .figure-card figcaption, .figure-card > figcaption {{ margin:12px 0 0; color:#687983; font-size:11px; line-height:1.6; }}
    .financial-plate {{ overflow:hidden; }} .financial-dashboard {{ min-width:880px; }} .figure-card svg .chart-title {{ fill:#122334; font:700 14px Georgia,"Noto Serif SC",serif; }} .figure-card svg .chart-unit, .figure-card svg .chart-axis, .figure-card svg .chart-legend {{ fill:#687983; font:10px ui-monospace,monospace; }} .figure-card svg .chart-label {{ fill:#233744; font-size:10px; }} .figure-card svg .chart-value {{ fill:#d9532d; font:10px ui-monospace,monospace; }} .md-image-figure {{ background:#ffffff; }} .md-image-figure img {{ display:block; width:100%; height:auto; aspect-ratio:3/2; object-fit:cover; border:1px solid #cbd8de; filter:saturate(.9); }}
    .article-wrap {{ max-width:1160px; margin:0 auto; padding:0 clamp(22px,5vw,75px) 90px; background:rgba(255,255,255,.42); }} .article {{ color:#314550; }} .article h1 {{ font:700 42px/1.12 Georgia,"Noto Serif SC",serif; margin:0 0 26px; }} .article h2 {{ padding-top:58px; scroll-margin-top:22px; color:var(--ink); border-top:1px solid #d4dfe4; }} .article h3 {{ margin:30px 0 10px; color:var(--ink); font:700 21px/1.3 Georgia,"Noto Serif SC",serif; }} .article h4 {{ color:var(--orange); }} .article p {{ max-width:920px; margin:11px 0; color:#435862; font-size:14px; }} .article ul, .article ol {{ max-width:900px; color:#435862; padding-left:23px; font-size:14px; }} .article li {{ margin:5px 0; }} .article li::marker {{ color:var(--orange); }} .article blockquote {{ max-width:920px; margin:20px 0; padding:14px 17px; background:#eef5f7; border-left:3px solid var(--cyan); color:#314550; font-family:Georgia,"Noto Serif SC",serif; }} .rule {{ border:0; border-top:1px solid var(--line); margin:43px 0 15px; }}
    .data-details {{ max-width:100%; margin:18px 0 25px; border:1px solid #d4dfe4; background:#ffffff; }} .data-details summary {{ cursor:pointer; padding:12px 15px; color:#52636d; font:11px ui-monospace,monospace; list-style:none; }} .data-details summary::before {{ content:"＋"; margin-right:8px; color:var(--orange); }} .data-details[open] summary::before {{ content:"−"; }} .table-wrap {{ max-width:100%; overflow:auto; margin:0; border-top:1px solid #d4dfe4; }} table {{ width:100%; border-collapse:collapse; min-width:650px; font-size:12px; }} th, td {{ padding:9px 11px; text-align:left; border-bottom:1px solid #e3eaed; vertical-align:top; }} th {{ position:sticky; top:0; background:#edf3f5; color:#233744; font:11px ui-monospace,monospace; white-space:nowrap; }} td {{ color:#52636d; }} tr:last-child td {{ border-bottom:0; }} tr:hover td {{ background:#f5f8f9; }}
    .code-block {{ overflow:auto; padding:15px; background:#eef4f6; border:1px solid var(--line); border-radius:5px; color:#2873bd; }}
    .source-drawer {{ position:fixed; z-index:12; top:0; right:0; width:min(560px,92vw); height:100vh; overflow:auto; transform:translateX(102%); transition:transform .28s ease; background:#ffffff; border-left:1px solid var(--line); box-shadow:-30px 0 80px rgba(35,59,72,.18); }} body.sources-open .source-drawer {{ transform:translateX(0); }} .drawer-head {{ display:flex; justify-content:space-between; padding:19px 22px; position:sticky; top:0; background:rgba(255,255,255,.94); backdrop-filter:blur(10px); border-bottom:1px solid var(--line); color:var(--orange); font:11px ui-monospace,monospace; letter-spacing:.14em; }} button {{ color:var(--text); background:transparent; border:1px solid var(--line); padding:6px 9px; border-radius:5px; cursor:pointer; }} .source-list {{ padding:17px 22px 40px; }} .source-item {{ padding:16px 0; border-bottom:1px solid #e1e9ed; }} .source-item h3 {{ margin:5px 0; color:var(--ink); font:16px Georgia,"Noto Serif SC",serif; }} .source-item p {{ margin:4px 0; color:var(--muted); font-size:12px; }} .source-id {{ color:var(--orange); font:10px ui-monospace,monospace; }} details {{ margin-top:9px; color:#687983; font-size:11px; }}
    .open-sources {{ position:fixed; right:22px; bottom:20px; z-index:10; color:#ffffff; background:var(--cyan); border:0; border-radius:5px; padding:10px 14px; font-weight:700; box-shadow:0 8px 24px rgba(35,59,72,.18); }}
    .footer {{ max-width:1160px; margin:auto; padding:25px clamp(22px,5vw,75px) 45px; border-top:1px solid var(--line); color:#71828c; font:11px ui-monospace,monospace; }}
    @media (max-width:980px) {{ .app-shell {{ display:block; }} .rail {{ position:relative; height:auto; padding:16px 22px; border-right:0; border-bottom:1px solid var(--line); }} .brand {{ margin-bottom:12px; }} .nav {{ display:flex; overflow:auto; max-height:none; padding-bottom:2px; }} .nav a {{ white-space:nowrap; }} .rail-label, .rail-footer {{ display:none; }} .hero {{ min-height:570px; padding-top:40px; }} .thermal-ribbon {{ top:30px; opacity:.35; }} .stats {{ grid-template-columns:repeat(2,1fr); }} .segment-grid, .signal-grid {{ grid-template-columns:1fr; }} .priority-row {{ grid-template-columns:80px 1fr; }} .priority-row em {{ grid-column:2; }} .board-head {{ display:block; }} .board-head p {{ margin-top:10px; }} .hardware-grid {{ grid-template-columns:1fr; }} }}
    @media (max-width:600px) {{ .hero {{ padding:32px 19px 35px; min-height:610px; }} .hero h1 {{ font-size:43px; }} .hero-subtitle {{ font-size:14px; }} .thermal-ribbon {{ width:710px; top:95px; right:-245px; opacity:.27; }} .stats {{ gap:8px; }} .stat-card {{ padding:12px; }} .stat-card strong {{ font-size:22px; }} .canvas, .article-wrap {{ padding-left:17px; padding-right:17px; }} .canvas h2, .article h2 {{ font-size:27px; }} .figure-card {{ padding:15px 12px; }} .figure-heading {{ display:block; }} .figure-heading strong {{ display:block; margin-top:5px; font-size:17px; }} .figure-card svg {{ min-width:620px; }} .figure-card {{ overflow:auto; }} .priority-row {{ display:block; }} .priority-row strong, .priority-row em {{ display:block; margin-top:5px; }} .hardware-board {{ padding:15px; }} .hardware-caption {{ display:block; }} .hardware-caption span {{ display:block; margin-top:6px; }} .hardware-facility .hardware-media img {{ aspect-ratio:3/2; }} .open-sources {{ right:12px; bottom:12px; }} }}
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
      <section class="canvas" id="investment-conclusion"><p class="section-kicker">00 / INVESTMENT CONCLUSION</p><h2>把行业机会拆成可验证的公司机会</h2><p class="canvas-intro">液冷行业的增长确定性高于单家公司业绩确定性。下方先呈现环节优先级、公司关注顺序和核心验证条件；随后正文按原始模块顺序展开。</p><div class="segment-grid">{best_cards}</div><div class="priority-panel"><div class="section-kicker">COMPANY PRIORITY</div>{priority_cards}</div>{hardware_board(asset_images or {})}<div class="signal-grid"><article class="signal-card"><h3>催化剂</h3><ul>{catalysts}</ul></article><article class="signal-card"><h3>验证条件</h3><ul>{validate}</ul></article><article class="signal-card"><h3>失效条件</h3><ul>{invalid}</ul></article></div><div class="visual-stack">{light_svg(system_figure())}{light_svg(market_figure(data))}{light_svg(penetration_figure(data))}{light_svg(value_pool_figure(data))}{light_svg(competition_figure(data))}{light_svg(financial_figure(data))}</div></section>
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
    asset_svgs = figure_assets(data)
    asset_images = read_image_assets(args.markdown.parent / "assets")
    if args.check:
        result = build_html(markdown, data, asset_svgs, asset_images)
        assert "<!doctype html>" in result.lower()
        assert "source-drawer" in result
        assert "THERMAL CARTOGRAPHY" in result
        assert len(asset_images) == 3
        print(f"liquid cooling report build check: PASS ({len(result):,} chars)")
        return 0
    write_figure_assets(asset_svgs, args.markdown.parent / "assets")
    result = build_html(markdown, data, asset_svgs, asset_images)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(result, encoding="utf-8")
    print(f"wrote {args.output} ({len(result):,} chars)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
