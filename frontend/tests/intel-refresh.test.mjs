import test from "node:test";
import assert from "node:assert/strict";

import { runIntelRefresh } from "../src/lib/intel-refresh.ts";

test("manual refresh forces radar refresh before loading research hub", async () => {
  const calls = [];
  const result = await runIntelRefresh({
    forceRadarRefresh: true,
    refreshRadar: async () => {
      calls.push("refreshRadar");
      return { generated_at: "2026-07-17 21:30" };
    },
    refreshHiringRadar: async () => {
      calls.push("refreshHiringRadar");
    },
    loadRadar: async () => {
      calls.push("loadRadar");
      return { generated_at: "2026-07-17 21:00" };
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

  assert.deepEqual(calls.slice(0, 3), ["refreshRadar", "refreshHiringRadar", "loadHub"]);
  assert.equal(result.radarGeneratedAt, "2026-07-17 21:30");
});

test("background load does not force radar refresh", async () => {
  const calls = [];
  const result = await runIntelRefresh({
    forceRadarRefresh: false,
    refreshRadar: async () => {
      calls.push("refreshRadar");
      return { generated_at: "2026-07-17 21:30" };
    },
    refreshHiringRadar: async () => {
      calls.push("refreshHiringRadar");
    },
    loadRadar: async () => {
      calls.push("loadRadar");
      return { generated_at: "2026-07-17 21:10" };
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
  assert.equal(calls.includes("refreshHiringRadar"), false);
  assert.equal(calls[0], "loadRadar");
  assert.equal(calls.includes("loadRadar"), true);
  assert.equal(result.radarGeneratedAt, "2026-07-17 21:10");
});

test("manual refresh falls back to cached radar when refresh request fails", async () => {
  const calls = [];
  const result = await runIntelRefresh({
    forceRadarRefresh: true,
    refreshRadar: async () => {
      calls.push("refreshRadar");
      throw new Error("HTTP 500");
    },
    refreshHiringRadar: async () => {
      calls.push("refreshHiringRadar");
    },
    loadRadar: async () => {
      calls.push("loadRadar");
      return { generated_at: "2026-07-18 09:30" };
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

  assert.equal(calls.includes("loadRadar"), true);
  assert.equal(calls.includes("refreshHiringRadar"), false);
  assert.equal(result.radarGeneratedAt, "2026-07-18 09:30");
  assert.equal(result.refreshError, "HTTP 500");
});
