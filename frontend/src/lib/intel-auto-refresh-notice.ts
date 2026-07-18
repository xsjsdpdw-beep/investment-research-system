export function formatIntelAutoRefreshNotice(radarUpdatedAt: string | null) {
  if (!radarUpdatedAt) return "发现新内容，已自动更新";

  const normalized = radarUpdatedAt.includes("T") ? radarUpdatedAt.replace("T", " ") : radarUpdatedAt;
  const timeOnly = normalized.slice(11, 16);
  return timeOnly ? `发现新内容，已自动更新（${timeOnly}）` : "发现新内容，已自动更新";
}
