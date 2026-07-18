import type { ResearchHubData } from "@/lib/api";

export function buildIntelContentSignature(hub: ResearchHubData | null): string {
  if (!hub) return "";

  const rows = [
    ...(hub.fundamental.global_tech_headlines ?? []).map((item) => [
      "tech",
      item.industry_key,
      item.title,
      item.url,
      item.time,
      item.source,
    ].join("|")),
    ...(hub.fundamental.macro_events ?? []).flatMap((group) => (group.items ?? []).map((item) => [
      "macro",
      group.key,
      item.title,
      item.url,
      item.time,
      item.source,
    ].join("|"))),
    ...(hub.fundamental.industry_dynamics ?? []).flatMap((group) => (group.items ?? []).map((item) => [
      "industry",
      group.key,
      item.title,
      item.url,
      item.time,
      item.source,
    ].join("|"))),
    ...(hub.fundamental.stock_topics ?? []).flatMap((group) => (group.items ?? []).map((item) => [
      "stock-topic",
      group.key,
      item.title,
      item.url,
      item.time,
      item.source,
    ].join("|"))),
    ...(hub.fundamental.stock_dynamics ?? []).map((item) => [
      "stock-dynamic",
      item.ticker,
      item.name,
      ...(item.highlights ?? []),
    ].join("|")),
    ...(hub.fundamental.geopolitics.items ?? []).map((item) => [
      "geopolitics",
      item.industry_key || "",
      item.title,
      item.url || "",
      item.time || "",
      item.source || "",
    ].join("|")),
  ];

  return rows.join("\n");
}
