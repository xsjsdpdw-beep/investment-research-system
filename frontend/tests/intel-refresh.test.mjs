import test from "node:test";
import assert from "node:assert/strict";

import { runIntelRefresh } from "../src/lib/intel-refresh.ts";

test("manual refresh forces radar refresh before loading research hub", async () => {
  const calls = [];

  await runIntelRefresh({
    forceRadarRefresh: true,
    refreshRadar: async () => {
      calls.push("refreshRadar");
    },
    loadHub: async () => {
      calls.push("loadHub");
      return {
        generated_at: "",
        fundamental: {
          global_tech_headlines: [],
          macro_events: [],
          industry_dynamics: [],
          stock_dynamics: [],
          stock_topics: [],
          geopolitics: { items: [], groups: [] },
          source_interfaces: {
            industry_expert_notes: { active_provider: "" },
            stock_expert_notes: { active_provider: "" },
          },
          news_source_config: null,
        },
        liquidity: {
          daily_review: { summary: "", etf_placeholder: "" },
          indicators: [],
          commodities: [],
        },
        framework: {},
      };
    },
    loadMarketOverview: async () => {
      calls.push("loadMarketOverview");
      return { sentiment: { up: 0, down: 0 }, sectors: [], updated: "" };
    },
    loadGlobalIndices: async () => {
      calls.push("loadGlobalIndices");
      return [];
    },
    loadTurnoverTop: async () => {
      calls.push("loadTurnoverTop");
      return { stocks: [], updated: "" };
    },
    loadWatchlist: async () => {
      calls.push("loadWatchlist");
      return { stocks: [], indicators: [], updated_at: "" };
    },
    loadNewsSourcesConfig: async () => {
      calls.push("loadNewsSourcesConfig");
      return null;
    },
    loadAnnouncements: async () => {
      calls.push("loadAnnouncements");
      return [];
    },
    loadNews: async () => {
      calls.push("loadNews");
      return [];
    },
  });

  assert.deepEqual(calls.slice(0, 2), ["refreshRadar", "loadHub"]);
});

test("background load does not force radar refresh", async () => {
  const calls = [];

  await runIntelRefresh({
    forceRadarRefresh: false,
    refreshRadar: async () => {
      calls.push("refreshRadar");
    },
    loadHub: async () => {
      calls.push("loadHub");
      return {
        generated_at: "",
        fundamental: {
          global_tech_headlines: [],
          macro_events: [],
          industry_dynamics: [],
          stock_dynamics: [],
          stock_topics: [],
          geopolitics: { items: [], groups: [] },
          source_interfaces: {
            industry_expert_notes: { active_provider: "" },
            stock_expert_notes: { active_provider: "" },
          },
          news_source_config: null,
        },
        liquidity: {
          daily_review: { summary: "", etf_placeholder: "" },
          indicators: [],
          commodities: [],
        },
        framework: {},
      };
    },
    loadMarketOverview: async () => null,
    loadGlobalIndices: async () => [],
    loadTurnoverTop: async () => null,
    loadWatchlist: async () => ({ stocks: [], indicators: [], updated_at: "" }),
    loadNewsSourcesConfig: async () => null,
    loadAnnouncements: async () => [],
    loadNews: async () => [],
  });

  assert.equal(calls.includes("refreshRadar"), false);
  assert.equal(calls[0], "loadHub");
});
