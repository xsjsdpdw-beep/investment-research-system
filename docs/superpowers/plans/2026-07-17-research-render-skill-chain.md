# Research Ingest Skill Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local unified `research_ingest_skill` foundation that routes 有道云笔记、PDF研报、扫描件、图片资料 through OCR/extraction, structured normalization, candidate generation, and beautified preview for 行业概览 and 个股概览.

**Architecture:** Keep the existing overview workbench and candidate workflow, but add a new backend-local `research_ingest_skill` foundation. Source adapters normalize 有道、PDF、图片输入; an OCR/extract router decides between MinerU, OCRmyPDF, PaddleOCR, and Umi-OCR; normalizers convert all outputs into `StructuredRenderBlock[]`; candidate builders store structured patches alongside current text fields; and the frontend renders draft/deep previews from structured blocks using a unified left-directory/right-content layout.

**Tech Stack:** Python/FastAPI backend, local JSON persistence in `backend/knowledge.py`, React/TypeScript frontend in `frontend/src/pages/Framework.tsx`, pytest, Vitest/TypeScript build, local adapters for MinerU, OCRmyPDF, PaddleOCR, and Umi-OCR.

## Global Constraints

- Only support `有道云笔记`、`本地 PDF / 研报文件`、and `单独上传图片` through the unified skill in this phase.
- Only service `行业概览` and `个股概览` in this phase.
- Never auto-overwrite deep content; always generate candidate versions for human confirmation.
- Keep the existing `初稿 / 深度 / 待吸收` workflow and existing candidate apply semantics.
- Preserve current local-file-first architecture; do not introduce a separate microservice.
- Keep current overview editor binding and Youdao sync flow working.
- Do not expand this phase to full web scraping,公众号抓取, or image-poster generation.

---

### Task 1: Add Structured Render Models To The Overview Workbench

**Files:**
- Create: `tests/test_research_render_models.py`
- Modify: `backend/knowledge.py`
- Modify: `backend/app.py`
- Modify: `frontend/src/lib/api.ts`

**Interfaces:**
- Consumes: existing `get_overview_workbench(scope_type: str, scope_id: str) -> dict[str, Any]`
- Produces:
  - `normalize_structured_render_block(block: dict[str, Any], index: int = 0) -> dict[str, Any]`
  - `normalize_structured_render_blocks(blocks: list[dict[str, Any]] | None) -> list[dict[str, Any]]`
  - `save_overview_structured_preview(scope_type: str, scope_id: str, draft_blocks: list[dict[str, Any]], deep_blocks: list[dict[str, Any]]) -> dict[str, Any]`
  - TypeScript interfaces `StructuredRenderBlock`, `StructuredRenderCandidatePatch`

- [ ] **Step 1: Write the failing backend model test**

```python
from backend import knowledge


def test_normalize_structured_render_block_defaults():
    block = knowledge.normalize_structured_render_block({
        "type": "paragraph",
        "title": "核心结论",
        "content": "需求继续改善。",
    })

    assert block["type"] == "paragraph"
    assert block["title"] == "核心结论"
    assert block["content"] == "需求继续改善。"
    assert block["children"] == []
    assert block["source_refs"] == []
    assert block["render_hint"] == {}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_research_render_models.py::test_normalize_structured_render_block_defaults -v`

Expected: FAIL with `AttributeError: module 'backend.knowledge' has no attribute 'normalize_structured_render_block'`

- [ ] **Step 3: Write minimal backend model implementation**

```python
def normalize_structured_render_block(block: dict[str, Any], index: int = 0) -> dict[str, Any]:
    raw_type = (block.get("type") or "paragraph").strip()
    normalized_type = raw_type if raw_type in {
        "section", "paragraph", "bullet_list", "quote", "table",
        "metric_grid", "timeline", "process_flow", "industry_chain",
        "comparison_cards", "image", "chart_spec", "source_ref",
    } else "paragraph"
    return {
        "id": (block.get("id") or f"render-block-{index}").strip(),
        "type": normalized_type,
        "title": (block.get("title") or "").strip(),
        "section_key": (block.get("section_key") or "").strip(),
        "content": block.get("content") or "",
        "items": deepcopy(block.get("items") or []),
        "table": deepcopy(block.get("table") or {}),
        "image": deepcopy(block.get("image") or {}),
        "chart_spec": deepcopy(block.get("chart_spec") or {}),
        "source_refs": deepcopy(block.get("source_refs") or []),
        "children": [normalize_structured_render_block(child, child_index) for child_index, child in enumerate(block.get("children") or [])],
        "render_hint": deepcopy(block.get("render_hint") or {}),
    }
```

- [ ] **Step 4: Persist structured fields on overview records**

```python
def save_overview_structured_preview(scope_type: str, scope_id: str, draft_blocks: list[dict[str, Any]], deep_blocks: list[dict[str, Any]]) -> dict[str, Any]:
    record, items, index = _get_or_create_overview_record(scope_type, scope_id)
    record["draft_structured_blocks"] = normalize_structured_render_blocks(draft_blocks)
    record["deep_structured_blocks"] = normalize_structured_render_blocks(deep_blocks)
    record["updated_at"] = _now_iso()
    items[index] = record
    _save_overview_workbench(items)
    return deepcopy(record)
```

- [ ] **Step 5: Expose the new shapes through the API types**

```ts
export interface StructuredRenderBlock {
  id: string;
  type:
    | "section"
    | "paragraph"
    | "bullet_list"
    | "quote"
    | "table"
    | "metric_grid"
    | "timeline"
    | "process_flow"
    | "industry_chain"
    | "comparison_cards"
    | "image"
    | "chart_spec"
    | "source_ref";
  title: string;
  section_key: string;
  content: string;
  items: string[];
  table: Record<string, unknown>;
  image: Record<string, unknown>;
  chart_spec: Record<string, unknown>;
  source_refs: Array<Record<string, unknown>>;
  children: StructuredRenderBlock[];
  render_hint: Record<string, unknown>;
}
```

- [ ] **Step 6: Run backend and type checks**

Run: `pytest tests/test_research_render_models.py -v`

Expected: PASS

Run: `npm --prefix frontend run build`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/knowledge.py backend/app.py frontend/src/lib/api.ts tests/test_research_render_models.py
git commit -m "feat: add structured render models for overview workbench"
```

### Task 2: Build The Unified OCR/Extraction Router Skeleton

**Files:**
- Create: `backend/research_ingest.py`
- Create: `tests/test_research_ingest_router.py`
- Modify: `backend/app.py`

**Interfaces:**
- Consumes:
  - source metadata: `source_type`, `file_path`, `mime_type`, `provider`, `content`
- Produces:
  - `route_ingest_source(source: dict[str, Any]) -> dict[str, Any]`
  - `detect_pdf_kind(file_path: str) -> Literal["digital_pdf", "scanned_pdf"]`
  - `detect_source_kind(source: dict[str, Any]) -> str`

- [ ] **Step 1: Write the failing router test**

```python
from backend import research_ingest


def test_detect_source_kind_routes_youdao_image_to_ocr():
    source = {
        "source_type": "note_image",
        "provider": "youdao",
        "file_path": "",
        "content": "",
    }

    result = research_ingest.detect_source_kind(source)

    assert result == "youdao_image"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_research_ingest_router.py::test_detect_source_kind_routes_youdao_image_to_ocr -v`

Expected: FAIL with `ModuleNotFoundError: No module named 'backend.research_ingest'`

- [ ] **Step 3: Implement source-kind and route skeleton**

```python
def detect_source_kind(source: dict[str, Any]) -> str:
    source_type = (source.get("source_type") or "").strip()
    provider = (source.get("provider") or "").strip()
    file_path = (source.get("file_path") or "").strip().lower()
    if provider == "youdao" and source_type == "note_image":
        return "youdao_image"
    if provider == "youdao" and source_type in {"note", "note_text"}:
        return "youdao_text"
    if file_path.endswith(".pdf"):
        return "pdf"
    if file_path.endswith((".png", ".jpg", ".jpeg", ".webp", ".bmp")):
        return "image"
    return "text"


def route_ingest_source(source: dict[str, Any]) -> dict[str, Any]:
    kind = detect_source_kind(source)
    if kind == "pdf":
        pdf_kind = detect_pdf_kind(source["file_path"])
        return {"kind": kind, "engine_chain": ["ocrmypdf", "paddleocr"] if pdf_kind == "scanned_pdf" else ["mineru"]}
    if kind in {"youdao_image", "image"}:
        return {"kind": kind, "engine_chain": ["paddleocr", "umi_ocr"]}
    if kind == "youdao_text":
        return {"kind": kind, "engine_chain": ["native_youdao"]}
    return {"kind": kind, "engine_chain": ["plain_text"]}
```

- [ ] **Step 4: Run tests**

Run: `pytest tests/test_research_ingest_router.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/research_ingest.py backend/app.py tests/test_research_ingest_router.py
git commit -m "feat: add unified ingest router skeleton"
```

### Task 3: Build The PDF Report Extraction Adapter Around The Unified Skill

**Files:**
- Modify: `backend/research_ingest.py`
- Create: `tests/test_research_render_pdf.py`
- Modify: `backend/app.py`
- Modify: `backend/knowledge.py`

**Interfaces:**
- Consumes:
  - `knowledge.append_overview_candidates(scope_type: str, scope_id: str, source_type: str, candidates: list[dict[str, Any]]) -> dict[str, Any]`
- Produces:
  - `extract_pdf_report_to_blocks(file_path: str, title: str) -> list[dict[str, Any]]`
  - `build_structured_candidate_from_pdf(scope_type: str, scope_id: str, file_path: str, title: str) -> dict[str, Any]`
  - `POST /api/research/overview-workbench/render/import-pdf`

- [ ] **Step 1: Write the failing PDF adapter test**

```python
from backend import research_ingest


def test_extract_pdf_report_to_blocks_falls_back_to_paragraph_blocks(tmp_path):
    report = tmp_path / "sample.md"
    report.write_text("# HBM行业\n\n需求继续扩张。\n\n| 环节 | 份额 |\n| --- | --- |\n| HBM | 32% |\n", encoding="utf-8")

    blocks = research_ingest.extract_pdf_report_to_blocks(str(report), "HBM行业")

    assert blocks[0]["type"] == "section"
    assert blocks[0]["title"] == "HBM行业"
    assert any(block["type"] == "table" for block in blocks[0]["children"])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_research_render_pdf.py::test_extract_pdf_report_to_blocks_falls_back_to_paragraph_blocks -v`

Expected: FAIL because `extract_pdf_report_to_blocks` is not implemented on `backend.research_ingest`

- [ ] **Step 3: Write the adapter with MinerU-first, markdown-fallback behavior**

```python
def extract_pdf_report_to_blocks(file_path: str, title: str) -> list[dict[str, Any]]:
    path = Path(file_path)
    if not path.exists():
        raise ValueError("研报文件不存在")
    if path.suffix.lower() == ".md":
        raw = path.read_text(encoding="utf-8")
        return markdown_to_structured_blocks(raw, title)
    route = route_ingest_source({"source_type": "report", "file_path": str(path), "provider": ""})
    if route["engine_chain"] == ["mineru"]:
        parsed = _run_mineru_if_available(path)
        if parsed:
            return mineru_json_to_structured_blocks(parsed, title)
    else:
        ocr_ready_path = _run_ocrmypdf_if_available(path)
        parsed = _run_paddleocr_if_available(ocr_ready_path or path)
        if parsed:
            return paddleocr_json_to_structured_blocks(parsed, title)
    raw = _extract_plain_text(path)
    return markdown_to_structured_blocks(raw or f"# {title}\n\n暂未提取到正文。", title)
```

- [ ] **Step 4: Add an API route that creates a structured attachment candidate**

```python
@app.post("/api/research/overview-workbench/render/import-pdf")
def research_overview_render_import_pdf(payload: OverviewRenderPdfIn):
    blocks = research_render.extract_pdf_report_to_blocks(payload.file_path, payload.title.strip())
    candidate = research_render.build_structured_candidate_from_pdf(
        payload.scope_type,
        payload.scope_id,
        payload.file_path,
        payload.title.strip(),
    )
    workbench = knowledge.append_overview_candidates(payload.scope_type, payload.scope_id, "report", [candidate])
    return {"data": {"blocks": blocks, "workbench": workbench}}
```

- [ ] **Step 5: Run tests**

Run: `pytest tests/test_research_render_pdf.py -v`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/research_ingest.py backend/app.py backend/knowledge.py tests/test_research_render_pdf.py
git commit -m "feat: add pdf extraction to unified ingest skill"
```

### Task 4: Add Structured Extraction For Youdao Notes And Embedded Images

**Files:**
- Create: `tests/test_research_render_youdao.py`
- Modify: `backend/research_ingest.py`
- Modify: `backend/app.py`

**Interfaces:**
- Consumes:
  - `youdao_sync.read_note(file_id: str) -> dict[str, str]`
  - `markdown_to_structured_blocks(raw: str, title: str) -> list[dict[str, Any]]`
- Produces:
  - `extract_youdao_note_to_blocks(file_id: str, title: str | None = None) -> tuple[str, list[dict[str, Any]]]`
  - `build_structured_candidate_from_youdao(scope_type: str, scope_id: str, file_id: str, title: str) -> dict[str, Any]`
  - upgraded `POST /api/research/overview-workbench/editor/import-note`

- [ ] **Step 1: Write the failing Youdao extraction test**

```python
from backend import research_ingest


def test_extract_youdao_note_to_blocks_preserves_headings(monkeypatch):
    monkeypatch.setattr(
        research_ingest.youdao_sync,
        "read_note",
        lambda file_id: {"content": "# 工程机械\n\n## 产业链\n\n主机厂需求回暖。"},
    )

    content, blocks = research_ingest.extract_youdao_note_to_blocks("note-1", "工程机械")

    assert "工程机械" in content
    assert blocks[0]["title"] == "工程机械"
    assert blocks[0]["children"][0]["title"] == "产业链"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_research_render_youdao.py::test_extract_youdao_note_to_blocks_preserves_headings -v`

Expected: FAIL with `AttributeError: module 'backend.research_ingest' has no attribute 'extract_youdao_note_to_blocks'`

- [ ] **Step 3: Implement Youdao note extraction**

```python
def extract_youdao_note_to_blocks(file_id: str, title: str | None = None) -> tuple[str, list[dict[str, Any]]]:
    note = youdao_sync.read_note(file_id)
    content = (note.get("content") or "").strip()
    if not content:
        raise ValueError("这篇有道笔记还没有可导入内容")
    resolved_title = (title or "").strip() or _first_heading_or_default(content, "有道笔记")
    return content, markdown_to_structured_blocks(content, resolved_title)
```

- [ ] **Step 4: Add a helper for embedded note images**

```python
def extract_youdao_note_image_to_blocks(image_path: str, title: str) -> list[dict[str, Any]]:
    route = route_ingest_source({"source_type": "note_image", "provider": "youdao", "file_path": image_path})
    parsed = _run_paddleocr_if_available(Path(image_path))
    if not parsed and route["engine_chain"][-1] == "umi_ocr":
        parsed = _run_umiocr_if_available(Path(image_path))
    return ocr_result_to_structured_blocks(parsed or {}, title)
```

- [ ] **Step 5: Upgrade the import-note endpoint to store structured candidate patches**

```python
content, blocks = research_ingest.extract_youdao_note_to_blocks(file_id, title)
candidate = research_ingest.build_structured_candidate_from_youdao(
    payload.scope_type,
    payload.scope_id,
    file_id,
    title,
)
workbench = knowledge.append_overview_candidates(payload.scope_type, payload.scope_id, "note", [candidate])
```

- [ ] **Step 6: Run tests**

Run: `pytest tests/test_research_render_youdao.py -v`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/research_ingest.py backend/app.py tests/test_research_render_youdao.py
git commit -m "feat: add structured extraction for youdao notes and images"
```

### Task 5: Add Image OCR Ingestion Through The Unified Skill

**Files:**
- Create: `tests/test_research_ingest_images.py`
- Modify: `backend/research_ingest.py`
- Modify: `backend/app.py`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/pages/Framework.tsx`

**Interfaces:**
- Consumes:
  - `route_ingest_source(source: dict[str, Any]) -> dict[str, Any]`
- Produces:
  - `extract_image_to_blocks(file_path: str, title: str) -> list[dict[str, Any]]`
  - `POST /api/research/overview-workbench/render/import-image`

- [ ] **Step 1: Write the failing image ingest test**

```python
from backend import research_ingest


def test_extract_image_to_blocks_uses_ocr_fallback(monkeypatch, tmp_path):
    image = tmp_path / "note.png"
    image.write_bytes(b"fake")
    monkeypatch.setattr(research_ingest, "_run_paddleocr_if_available", lambda path: None)
    monkeypatch.setattr(research_ingest, "_run_umiocr_if_available", lambda path: {"text": "渠道库存下降"})

    blocks = research_ingest.extract_image_to_blocks(str(image), "渠道反馈")

    assert blocks
    assert any("渠道库存下降" in (block.get("content") or "") for block in blocks)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_research_ingest_images.py::test_extract_image_to_blocks_uses_ocr_fallback -v`

Expected: FAIL because `extract_image_to_blocks` does not exist

- [ ] **Step 3: Implement image OCR ingestion**

```python
def extract_image_to_blocks(file_path: str, title: str) -> list[dict[str, Any]]:
    path = Path(file_path)
    if not path.exists():
        raise ValueError("图片文件不存在")
    parsed = _run_paddleocr_if_available(path)
    if not parsed:
        parsed = _run_umiocr_if_available(path)
    return ocr_result_to_structured_blocks(parsed or {"text": ""}, title)
```

- [ ] **Step 4: Add frontend API and attachment action**

```ts
importImageOverviewCandidate: (payload: {
  scope_type: "sector" | "stock";
  scope_id: string;
  file_path: string;
  title: string;
}) => request<{ blocks: StructuredRenderBlock[]; workbench: OverviewWorkbench }>("/research/overview-workbench/render/import-image", "POST", payload),
```

- [ ] **Step 5: Run tests**

Run: `pytest tests/test_research_ingest_images.py -v`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/research_ingest.py backend/app.py frontend/src/lib/api.ts frontend/src/pages/Framework.tsx tests/test_research_ingest_images.py
git commit -m "feat: add image ocr ingestion to unified skill"
```

### Task 6: Extend Candidate Storage And Apply Logic For Structured Patches

**Files:**
- Create: `tests/test_overview_structured_candidates.py`
- Modify: `backend/knowledge.py`
- Modify: `backend/app.py`
- Modify: `frontend/src/lib/api.ts`

**Interfaces:**
- Consumes:
  - `append_overview_candidates(...) -> dict[str, Any]`
  - `apply_overview_candidate(...) -> dict[str, Any]`
- Produces:
  - candidate fields `structured_blocks`, `render_recipe`, `diff_preview`
  - card fields `structured_blocks`
  - version snapshots that preserve structured content

- [ ] **Step 1: Write the failing structured candidate apply test**

```python
from backend import knowledge


def test_apply_overview_candidate_keeps_structured_blocks():
    workbench = knowledge.save_overview_draft("sector", "HBM", {"summary": "", "modules": [], "sources": [], "keywords": []})
    knowledge.save_overview_deep_cards("sector", "HBM", [{
        "id": "card-market",
        "title": "市场规模",
        "body": "旧内容",
        "content_blocks": [],
    }])
    knowledge.append_overview_candidates("sector", "HBM", "report", [{
        "id": "candidate-market",
        "title": "市场规模更新",
        "summary": "新证据",
        "structured_blocks": [{"id": "b1", "type": "paragraph", "title": "", "content": "新证据", "children": []}],
        "proposed_patch": "新证据",
    }])

    result = knowledge.apply_overview_candidate("sector", "HBM", "candidate-market", "append", {"card_id": "card-market"})

    assert result["candidate"]["status"] == "accepted"
    assert result["card"]["content_blocks"]
    assert result["version"]["after_snapshot"]["content_blocks"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_overview_structured_candidates.py::test_apply_overview_candidate_keeps_structured_blocks -v`

Expected: FAIL because `structured_blocks` are ignored or missing in the saved candidate / version

- [ ] **Step 3: Normalize and persist structured candidate payloads**

```python
def _normalize_candidate(candidate: dict[str, Any], source_type: str, index: int) -> dict[str, Any]:
    normalized["structured_blocks"] = normalize_structured_render_blocks(candidate.get("structured_blocks") or [])
    normalized["render_recipe"] = deepcopy(candidate.get("render_recipe") or {})
    normalized["diff_preview"] = deepcopy(candidate.get("diff_preview") or {})
    return normalized
```

- [ ] **Step 4: Prefer structured blocks when applying a candidate**

```python
def _candidate_to_content_block(candidate: dict[str, Any], card_id: str, target_block: str) -> dict[str, Any]:
    structured_blocks = normalize_structured_render_blocks(candidate.get("structured_blocks") or [])
    if structured_blocks:
        return {
            "id": f"{card_id}-candidate-structured-{_slugify(candidate.get('id') or 'patch')}",
            "type": "section",
            "title": candidate.get("title") or "候选更新",
            "children": structured_blocks,
            "source_label": _overview_source_label(candidate.get("source_type")),
        }
```

- [ ] **Step 5: Add matching TypeScript fields**

```ts
export interface OverviewCandidate {
  id: string;
  title: string;
  summary: string;
  structured_blocks?: StructuredRenderBlock[];
  render_recipe?: Record<string, unknown>;
  diff_preview?: Record<string, unknown>;
}
```

- [ ] **Step 6: Run tests**

Run: `pytest tests/test_overview_structured_candidates.py -v`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/knowledge.py backend/app.py frontend/src/lib/api.ts tests/test_overview_structured_candidates.py
git commit -m "feat: support structured patches in overview candidates"
```

### Task 7: Build The Frontend Structured Preview Renderer

**Files:**
- Create: `frontend/src/components/research/StructuredOverviewRenderer.tsx`
- Create: `frontend/src/components/research/StructuredOverviewSidebar.tsx`
- Modify: `frontend/src/pages/Framework.tsx`
- Modify: `frontend/src/lib/api.ts`

**Interfaces:**
- Consumes:
  - `StructuredRenderBlock[]`
  - `OverviewCandidate.structured_blocks`
  - `OverviewWorkbench.draft_structured_blocks`
  - `OverviewWorkbench.deep_structured_blocks`
- Produces:
  - `<StructuredOverviewRenderer blocks={blocks} density="draft" | "deep" />`
  - `<StructuredOverviewSidebar blocks={blocks} activeId={activeId} onJump={setActiveId} />`

- [ ] **Step 1: Write the failing renderer test**

```tsx
import { render, screen } from "@testing-library/react";
import { StructuredOverviewRenderer } from "@/components/research/StructuredOverviewRenderer";

test("renders section headings and paragraph blocks", () => {
  render(
    <StructuredOverviewRenderer
      blocks={[
        {
          id: "s1",
          type: "section",
          title: "产业链",
          section_key: "industry-chain",
          content: "",
          items: [],
          table: {},
          image: {},
          chart_spec: {},
          source_refs: [],
          render_hint: {},
          children: [
            {
              id: "p1",
              type: "paragraph",
              title: "",
              section_key: "",
              content: "主机厂补库继续。",
              items: [],
              table: {},
              image: {},
              chart_spec: {},
              source_refs: [],
              render_hint: {},
              children: [],
            },
          ],
        },
      ]}
      density="deep"
    />,
  );

  expect(screen.getByText("产业链")).toBeInTheDocument();
  expect(screen.getByText("主机厂补库继续。")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend test -- StructuredOverviewRenderer`

Expected: FAIL with `Cannot find module '@/components/research/StructuredOverviewRenderer'`

- [ ] **Step 3: Implement the renderer component**

```tsx
export function StructuredOverviewRenderer({
  blocks,
  density,
}: {
  blocks: StructuredRenderBlock[];
  density: "draft" | "deep";
}) {
  return (
    <div className="space-y-4">
      {blocks.map((block) => (
        <StructuredOverviewBlock key={block.id} block={block} density={density} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Switch draft/deep tabs in `Framework.tsx` to prefer structured blocks**

```tsx
const draftBlocks = sectorWorkbench?.draft_structured_blocks?.length
  ? sectorWorkbench.draft_structured_blocks
  : normalizeLegacyDraftBlocks(sectorDraftBlocks);

const deepBlocks = sectorWorkbench?.deep_structured_blocks?.length
  ? sectorWorkbench.deep_structured_blocks
  : normalizeLegacyDeepBlocks(sectorDeepCards);
```

- [ ] **Step 5: Render higher-density cards for tables, process flows, and industry chains**

```tsx
if (block.type === "process_flow") {
  return <ProcessFlowPanel title={block.title} items={block.items} />;
}
if (block.type === "industry_chain") {
  return <IndustryChainPanel title={block.title} items={block.items} />;
}
if (block.type === "table") {
  return <StructuredTablePanel title={block.title} table={block.table} />;
}
```

- [ ] **Step 6: Run frontend verification**

Run: `npm --prefix frontend test -- StructuredOverviewRenderer`

Expected: PASS

Run: `npm --prefix frontend run build`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/research/StructuredOverviewRenderer.tsx frontend/src/components/research/StructuredOverviewSidebar.tsx frontend/src/pages/Framework.tsx frontend/src/lib/api.ts
git commit -m "feat: add structured overview renderer"
```

### Task 8: Wire Attachment Ingestion And Candidate Review End-To-End

**Files:**
- Create: `tests/test_research_render_endpoints.py`
- Modify: `backend/app.py`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/pages/Framework.tsx`

**Interfaces:**
- Consumes:
  - `POST /api/research/overview-workbench/render/import-pdf`
  - `POST /api/research/overview-workbench/editor/import-note`
  - `applyOverviewCandidate(...)`
- Produces:
  - frontend actions `importPdfOverviewCandidate(...)`
  - candidate compare panel that previews structured content before apply

- [ ] **Step 1: Write the failing endpoint test**

```python
from fastapi.testclient import TestClient
from backend.app import app


client = TestClient(app)


def test_import_note_endpoint_returns_structured_candidate(monkeypatch):
    monkeypatch.setattr(
        "backend.research_ingest.extract_youdao_note_to_blocks",
        lambda file_id, title=None: ("# 工程机械\n\n需求回暖", [{"id": "s1", "type": "section", "title": "工程机械", "children": []}]),
    )

    response = client.post(
        "/api/research/overview-workbench/editor/import-note",
        json={"scope_type": "sector", "scope_id": "工程机械", "file_id": "note-1", "title": "工程机械纪要"},
    )

    assert response.status_code == 200
    candidate = response.json()["data"]["candidates"][0]
    assert candidate["structured_blocks"][0]["title"] == "工程机械"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_research_render_endpoints.py::test_import_note_endpoint_returns_structured_candidate -v`

Expected: FAIL because the endpoint still returns text-only candidates

- [ ] **Step 3: Add frontend API methods for the new PDF import route**

```ts
importPdfOverviewCandidate: (payload: {
  scope_type: "sector" | "stock";
  scope_id: string;
  file_path: string;
  title: string;
}) => request<{ blocks: StructuredRenderBlock[]; workbench: OverviewWorkbench }>("/research/overview-workbench/render/import-pdf", "POST", payload),

importImageOverviewCandidate: (payload: {
  scope_type: "sector" | "stock";
  scope_id: string;
  file_path: string;
  title: string;
}) => request<{ blocks: StructuredRenderBlock[]; workbench: OverviewWorkbench }>("/research/overview-workbench/render/import-image", "POST", payload),
```

- [ ] **Step 4: Upgrade compare preview to render structured candidate content**

```tsx
const candidateBlocks =
  compareState.candidate?.structured_blocks?.length
    ? compareState.candidate.structured_blocks
    : fallbackCandidateBlocks(compareState.candidate);

<StructuredOverviewRenderer blocks={candidateBlocks} density="draft" />
```

- [ ] **Step 5: Add attachment-ingestion actions in the framework page**

```tsx
const importPdfAttachmentToOverview = async (scope: "sector" | "stock", scopeId: string, filePath: string, title: string) => {
  const result = await api.importPdfOverviewCandidate({
    scope_type: scope,
    scope_id: scopeId,
    file_path: filePath,
    title,
  });
  if (scope === "sector") setSectorWorkbench(result.workbench);
  else setStockWorkbench(result.workbench);
};
```

- [ ] **Step 6: Run full verification**

Run: `pytest tests/test_research_render_endpoints.py -v`

Expected: PASS

Run: `pytest tests/test_research_render_models.py tests/test_research_ingest_router.py tests/test_research_render_pdf.py tests/test_research_render_youdao.py tests/test_research_ingest_images.py tests/test_overview_structured_candidates.py tests/test_research_render_endpoints.py -v`

Expected: PASS

Run: `npm --prefix frontend run build`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app.py frontend/src/lib/api.ts frontend/src/pages/Framework.tsx tests/test_research_render_endpoints.py
git commit -m "feat: wire research render ingestion end to end"
```

## Self-Review

### Spec coverage

- `有道云笔记` and `本地 PDF / 研报文件` only: covered by Tasks 2, 3, and 6.
- unified ingest skill with OCR routing: covered by Tasks 2, 3, 4, and 5.
- `有道云笔记`、`本地 PDF / 研报文件`、`单独上传图片`: covered by Tasks 3, 4, 5, and 8.
- `行业概览` and `个股概览` only: all tasks wire through existing `scope_type: "sector" | "stock"` interfaces.
- `候选版本，人工确认后替换`: Task 4 preserves candidate apply flow and extends it with structured patches.
- `附件投喂入口 + 候选池联动`: Task 6 wires new ingestion routes into existing Framework attachment/candidate flows.
- `初稿 / 深度` unified rendering shell: Task 5 introduces a structured renderer for both tabs.
- `MinerU + OCRmyPDF + PaddleOCR + Umi-OCR + markdown-viewer/skills + Kami + CyberPPT` role split: Tasks 2, 3, 4, 5, and 7 implement the extraction/rendering boundaries without expanding scope into PPT generation.

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” markers remain.
- Every task names exact files and commands.
- Each code step includes concrete function names and example code.

### Type consistency

- Backend model name is consistently `StructuredRenderBlock`.
- Candidate payload fields are consistently `structured_blocks`, `render_recipe`, and `diff_preview`.
- Frontend renderer consumes `StructuredRenderBlock[]` in both draft and deep modes.
