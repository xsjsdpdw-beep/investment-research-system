# Youdao Note Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve `.note`-style Youdao content rendering in overview pages by cleaning noisy text and presenting richer tables, callouts, and section typography.

**Architecture:** Keep the original bound Youdao note content unchanged, add a frontend-only normalization pipeline that detects note-like content, converts it into cleaner markdown, and renders it with richer components. Use a safe fallback to the raw markdown/text path if parsing confidence is low.

**Tech Stack:** React, TypeScript, ReactMarkdown, remark-gfm, existing Tailwind utility styling in `Framework.tsx`

## Global Constraints

- Do not modify or overwrite bound Youdao note content in storage.
- Apply cleanup/rendering only in the overview preview path.
- Keep `.md` note rendering working as-is.
- Fall back to raw content if normalization fails or produces empty output.

---

### Task 1: Add frontend-only Youdao note normalization helpers

**Files:**
- Modify: `frontend/src/pages/Framework.tsx`

**Interfaces:**
- Produces: `normalizeOverviewPreviewContent(raw: string, title: string): { markdown: string; mode: "markdown" | "enhanced-note" }`
- Produces: `looksLikeYoudaoNote(title: string, raw: string): boolean`

- [ ] Add helpers near existing markdown/text utilities to detect note-like content using title suffix, disclaimer noise, page markers, dot-leader TOC rows, and long plain-text density.
- [ ] Add a cleanup pipeline that removes repeated legal-disclaimer lines, standalone page counters, TOC dot-leader rows, excessive whitespace, and obvious OCR noise separators.
- [ ] Add light structure promotion that turns lines like `一、`, `1、`, `1.1`, `核心结论`, `关键证据`, `跟踪重点`, `来源` into markdown headings.
- [ ] Add a table-block normalizer for consecutive tab-separated or multi-space-separated rows so they render as markdown tables when column counts are stable.
- [ ] Ensure the helper returns raw content in `markdown` mode when no cleanup is needed, and cleaned markdown in `enhanced-note` mode otherwise.

### Task 2: Upgrade overview preview rendering styles

**Files:**
- Modify: `frontend/src/pages/Framework.tsx`

**Interfaces:**
- Consumes: `normalizeOverviewPreviewContent(raw, title)`
- Produces: richer `ReactMarkdown` preview block with custom table/list/blockquote rendering

- [ ] Replace the direct `noteMarkdown` preview path in `renderDeepCards` with normalized preview data derived from `binding.content` and `binding.title`.
- [ ] Generate heading tree from normalized markdown instead of the raw content.
- [ ] Add custom `ReactMarkdown` component mappings for `table`, `thead`, `tbody`, `tr`, `th`, `td`, `blockquote`, `hr`, `h1-h4`, `ul`, `ol`, and `p`.
- [ ] Style tables as dark glass cards with rounded rows, stronger header contrast, and compact readable spacing inspired by the user’s example.
- [ ] Style quotes/callouts and section headings with richer accents so note-heavy previews feel less like raw text dumps.

### Task 3: Verify fallback behavior and readability

**Files:**
- Modify: `frontend/src/pages/Framework.tsx`

**Interfaces:**
- Consumes: normalized preview mode

- [ ] Add a compact mode badge or hint in the preview header when `enhanced-note` mode is active, so the user knows the content was beautified for reading.
- [ ] Keep empty-state and fallback behavior intact when normalized content is blank or parsing confidence is low.
- [ ] Run frontend build validation with `./scripts/check-frontend-build.sh`.

