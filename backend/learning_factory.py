"""把已沉淀资料转成可互动学习包。"""

from __future__ import annotations

import json
import re
from html import escape
from pathlib import Path
from typing import Any

import knowledge


def _clean_points(text: str, fallback: str) -> list[str]:
    chunks = re.split(r"[\n。；;]+", text or "")
    points = [item.strip(" -\t\r") for item in chunks if len(item.strip(" -\t\r")) >= 8]
    return points[:8] or [fallback]


def _stage_titles() -> list[str]:
    return ["先抓主线", "拆业务逻辑", "找验证指标", "辨认风险", "形成观点"]


def _build_pack_payload(source: dict[str, Any], title: str) -> dict[str, Any]:
    points = _clean_points(source.get("content", ""), source.get("title", "学习资料"))
    stages = []
    for idx, stage_title in enumerate(_stage_titles()):
        point = points[idx % len(points)]
        stages.append({
            "id": f"stage-{idx + 1}",
            "title": stage_title,
            "objective": f"用 3 分钟理解：{point[:42]}",
            "cards": [
                {"label": "核心卡", "text": point},
                {"label": "追问卡", "text": "这条信息对行业景气、公司竞争力或估值假设有什么影响？"},
            ],
            "quiz": {
                "question": "这一关最应该沉淀成哪类判断？",
                "options": ["行业趋势", "公司 Alpha", "风险约束"],
                "answer": "行业趋势" if idx == 0 else "公司 Alpha" if idx in {1, 2} else "风险约束",
            },
        })

    slide_bullets = points[:5]
    return {
        "version": 1,
        "source_entry_id": source["id"],
        "source_title": source["title"],
        "title": title,
        "modes": [
            {"key": "challenge", "label": "闯关模式", "description": "像通关一样拆解研报主线，每关都有卡片和小测。"},
            {"key": "deck", "label": "路演模式", "description": "把资料改造成可翻页讲解的要点展示。"},
            {"key": "simulation", "label": "推演模式", "description": "围绕核心变量做情景分支，训练观点更新。"},
        ],
        "challenge": {
            "mode": "challenge",
            "stages": stages,
        },
        "deck": {
            "mode": "deck",
            "title": "路演模式",
            "slides": [
                {"title": "一句话结论", "bullets": slide_bullets[:2] or [source["title"]]},
                {"title": "核心证据", "bullets": slide_bullets[1:4] or slide_bullets},
                {"title": "待验证问题", "bullets": ["哪些指标能验证这个判断？", "哪些事实会推翻当前结论？"]},
            ],
        },
        "simulation": {
            "mode": "simulation",
            "title": "推演模式",
            "decision": "如果核心变量发生变化，投资结论应如何更新？",
            "branches": [
                {"case": "景气继续上行", "prompt": "提高哪些盈利或估值假设？"},
                {"case": "需求低于预期", "prompt": "先观察哪个领先指标？"},
                {"case": "风险暴露", "prompt": "触发降级观点的条件是什么？"},
            ],
        },
    }


def generate_learning_pack(source_entry_id: str, title: str | None = None) -> dict[str, Any]:
    source = knowledge.get_entry(source_entry_id)
    if not source:
        raise KeyError(source_entry_id)
    pack_title = (title or f"学习包：{source['title']}").strip()
    payload = _build_pack_payload(source, pack_title)
    return knowledge.create_entry({
        "title": pack_title,
        "type": "learning_pack",
        "content": json.dumps(payload, ensure_ascii=False, indent=2),
        "tags": list(dict.fromkeys(["学习包", *source.get("tags", [])])),
        "related_sectors": source.get("related_sectors", []),
        "related_stocks": source.get("related_stocks", []),
        "summary_status": "ready",
        "summary_text": f"已生成闯关、路演、推演三种学习视图：{source['title']}",
    })


def _artifact_path(entry_id: str) -> Path:
    knowledge.ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    safe_id = re.sub(r"[^0-9A-Za-z_.-]+", "-", entry_id).strip("-")
    return knowledge.ARTIFACT_DIR / f"{safe_id}-interactive.html"


def _pack_json(entry: dict[str, Any]) -> dict[str, Any]:
    if entry.get("type") != "learning_pack":
        raise ValueError("只有学习包可以生成互动网页")
    try:
        return json.loads(entry.get("content") or "{}")
    except json.JSONDecodeError as exc:
        raise ValueError("学习包内容不是有效 JSON") from exc


def _list_items(items: list[str]) -> str:
    return "".join(f"<li>{escape(str(item))}</li>" for item in items)


def _render_interactive_html(pack: dict[str, Any]) -> str:
    title = escape(pack.get("title") or "互动学习包")
    source_title = escape(pack.get("source_title") or "")
    stages = pack.get("challenge", {}).get("stages", [])
    slides = pack.get("deck", {}).get("slides", [])
    branches = pack.get("simulation", {}).get("branches", [])
    stage_cards = []
    for idx, stage in enumerate(stages):
        cards = "".join(
            f"<p><strong>{escape(card.get('label', '卡片'))}：</strong>{escape(card.get('text', ''))}</p>"
            for card in stage.get("cards", [])
        )
        quiz = stage.get("quiz", {})
        stage_cards.append(f"""
          <article class="stage-card" data-stage="{idx}">
            <div class="stage-index">LEVEL {idx + 1}</div>
            <h3>{escape(stage.get('title', '关卡'))}</h3>
            <p class="objective">{escape(stage.get('objective', ''))}</p>
            <div class="cards">{cards}</div>
            <button onclick="toggleAnswer(this)">查看小测答案</button>
            <p class="answer hidden">{escape(quiz.get('question', ''))}<br>参考：{escape(quiz.get('answer', ''))}</p>
          </article>
        """)
    slide_cards = "".join(f"""
      <section class="slide">
        <span>SLIDE {idx + 1}</span>
        <h3>{escape(slide.get('title', '路演页'))}</h3>
        <ul>{_list_items(slide.get('bullets', []))}</ul>
      </section>
    """ for idx, slide in enumerate(slides))
    branch_cards = "".join(f"""
      <article class="branch">
        <h3>{escape(branch.get('case', '情景'))}</h3>
        <p>{escape(branch.get('prompt', ''))}</p>
      </article>
    """ for branch in branches)
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title}</title>
  <style>
    :root {{ color-scheme: dark; --bg:#11150f; --card:#1e271d; --line:#385039; --text:#f4f0df; --muted:#b9b59f; --accent:#d6ff6b; --warm:#ffb86b; }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:"Songti SC","Noto Serif SC",serif; background:radial-gradient(circle at 15% 0%, #344323, transparent 32%), linear-gradient(135deg,#0f130d,#1b2117 55%,#11150f); color:var(--text); }}
    header {{ min-height:42vh; padding:72px 7vw 36px; border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--accent); letter-spacing:.18em; font-size:12px; text-transform:uppercase; }}
    h1 {{ max-width:980px; margin:18px 0; font-size:clamp(38px,6vw,82px); line-height:.98; }}
    .source {{ color:var(--muted); font-size:15px; }}
    nav {{ position:sticky; top:0; z-index:5; display:flex; gap:10px; padding:14px 7vw; background:rgba(17,21,15,.86); backdrop-filter:blur(16px); border-bottom:1px solid var(--line); }}
    nav a {{ color:var(--text); text-decoration:none; border:1px solid var(--line); border-radius:999px; padding:8px 14px; }}
    main {{ padding:34px 7vw 80px; }}
    .section-title {{ display:flex; align-items:end; justify-content:space-between; gap:20px; margin:34px 0 16px; }}
    .section-title h2 {{ margin:0; font-size:28px; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:16px; }}
    .stage-card,.slide,.branch {{ border:1px solid var(--line); background:linear-gradient(180deg,rgba(30,39,29,.94),rgba(21,27,20,.94)); border-radius:24px; padding:20px; box-shadow:0 18px 60px rgba(0,0,0,.24); }}
    .stage-index,.slide span {{ color:var(--accent); font-size:12px; letter-spacing:.14em; }}
    h3 {{ margin:10px 0; font-size:21px; }}
    .objective,p,li {{ color:var(--muted); line-height:1.72; }}
    button {{ border:0; border-radius:999px; background:var(--accent); color:#11150f; padding:9px 14px; font-weight:700; cursor:pointer; }}
    .answer {{ border-left:3px solid var(--warm); padding-left:12px; color:var(--text); }}
    .hidden {{ display:none; }}
    .slide {{ min-height:240px; display:flex; flex-direction:column; justify-content:center; }}
    .branch h3 {{ color:var(--warm); }}
    footer {{ padding:26px 7vw; color:var(--muted); border-top:1px solid var(--line); }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">interactive research learning pack</div>
    <h1>{title}</h1>
    <p class="source">来源资料：{source_title}</p>
  </header>
  <nav>
    <a href="#challenge">闯关模式</a>
    <a href="#deck">路演模式</a>
    <a href="#simulation">推演模式</a>
  </nav>
  <main>
    <section id="challenge">
      <div class="section-title"><h2>闯关模式</h2><p>每一关只解决一个认知动作。</p></div>
      <div class="grid">{''.join(stage_cards)}</div>
    </section>
    <section id="deck">
      <div class="section-title"><h2>路演模式</h2><p>适合快速讲给未来的自己或别人听。</p></div>
      <div class="grid">{slide_cards}</div>
    </section>
    <section id="simulation">
      <div class="section-title"><h2>推演模式</h2><p>{escape(pack.get("simulation", {}).get("decision", ""))}</p></div>
      <div class="grid">{branch_cards}</div>
    </section>
  </main>
  <footer>由个人投研系统生成。请结合原始资料复核关键事实。</footer>
  <script>
    function toggleAnswer(button) {{
      const answer = button.parentElement.querySelector('.answer');
      answer.classList.toggle('hidden');
      button.textContent = answer.classList.contains('hidden') ? '查看小测答案' : '收起小测答案';
    }}
  </script>
</body>
</html>"""


def generate_interactive_html(entry_id: str) -> dict[str, Any]:
    entry = knowledge.get_entry(entry_id)
    if not entry:
        raise KeyError(entry_id)
    pack = _pack_json(entry)
    path = _artifact_path(entry_id)
    path.write_text(_render_interactive_html(pack), encoding="utf-8")
    return {
        "entry_id": entry_id,
        "artifact_type": "interactive_html",
        "path": str(path),
        "url": f"/api/learning/packs/{entry_id}/interactive-html",
    }


def interactive_html_path(entry_id: str) -> Path:
    path = _artifact_path(entry_id)
    if not path.exists():
        generate_interactive_html(entry_id)
    return path
