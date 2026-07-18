# Hiring Radar Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `Hiring-Radar` to the 投研资讯 basic fundamentals area as a new last-position module named `招聘雷达`.

**Architecture:** Keep the current 投研资讯 page structure intact and add one backend adapter that fetches structured hiring data from the upstream `Hiring-Radar` script. Extend the existing `research_hub` payload and `Intel.tsx` rendering path so the new module behaves like the existing basic modules without adding a new page or route.

**Tech Stack:** Python, FastAPI, subprocess, urllib, React, TypeScript, node:test, pytest

## Global Constraints

- Only touch files related to 投研资讯 fundamentals, hiring adapter wiring, and focused regression tests.
- Keep the new module as the last basic module in both overview cards and detail tabs.
- Prefer local `Hiring-Radar` checkout when available; otherwise fall back to the official upstream script.
- Do not break existing five-module digest and image-generation flows; extend them to six modules.

---
