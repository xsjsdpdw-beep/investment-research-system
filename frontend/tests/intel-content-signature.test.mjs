import test from "node:test";
import assert from "node:assert/strict";

import { buildIntelContentSignature } from "../src/lib/intel-content-signature.ts";

function makeHub({
  tech = [],
  macro = [],
  industry = [],
  stockTopics = [],
  stockDynamics = [],
  geopolitics = [],
} = {}) {
  return {
    generated_at: "",
    fundamental: {
      source_interfaces: {
        industry_expert_notes: { active_provider: "", fallback_provider: "", dataset_key: "" },
        stock_expert_notes: { active_provider: "", fallback_provider: "", dataset_key: "" },
      },
      news_source_config: { fetch: { per_source: 0, timeout: 0, recent_days: 0 }, redline_keywords: [], industries: [], sources: [] },
      global_tech_headlines: tech,
      macro_events: macro,
      industry_dynamics: industry,
      stock_topics: stockTopics,
      stock_dynamics: stockDynamics,
      geopolitics: {
        title: "地缘政治",
        groups: [],
        items: geopolitics,
      },
    },
    liquidity: {
      daily_review: { summary: "", etf_placeholder: "" },
      indicators: [],
      commodities: [],
    },
    framework: {
      sector_focus: [],
      stock_focus: [],
      weekly_reviews: [],
    },
  };
}

test("identical intel content produces identical signatures", () => {
  const hub = makeHub({
    tech: [{ industry_key: "ai", title: "A", url: "u1", time: "t1", source: "s1", summary: "", ts: 1, industry_name: "AI" }],
    macro: [{ key: "macro-1", name: "Macro", accent: "", total: 1, items: [{ title: "B", url: "u2", time: "t2", source: "s2" }] }],
  });

  assert.equal(buildIntelContentSignature(hub), buildIntelContentSignature(hub));
});

test("changed intel content produces a different signature", () => {
  const before = makeHub({
    tech: [{ industry_key: "ai", title: "Old", url: "u1", time: "t1", source: "s1", summary: "", ts: 1, industry_name: "AI" }],
  });
  const after = makeHub({
    tech: [{ industry_key: "ai", title: "New", url: "u1", time: "t1", source: "s1", summary: "", ts: 1, industry_name: "AI" }],
  });

  assert.notEqual(buildIntelContentSignature(before), buildIntelContentSignature(after));
});
