import { FUND_ALLOCATION_SNAPSHOT } from "./fund-allocation";

export interface NationalDisclosure {
  date: string;
  ratio_pct: number | null;
  value_yi: number | null;
  total_shares_yi_qfq: number | null;
  source_label?: string;
  source_status?: string;
}

export interface NationalSeriesRow {
  date: string;
  price: number | null;
  avg_price: number | null;
  turnover_yi: number | null;
  scale_yi: number | null;
  units_yi: number | null;
  delta_units_yi: number | null;
  estimated_flow_yi: number | null;
  flow_basis?: string;
}

export interface NationalEtfItem {
  code: string;
  name: string;
  manager?: string;
  group: string;
  disclosures: NationalDisclosure[];
  data_source?: string;
  data_status?: string;
  series: NationalSeriesRow[];
  latest_market_date?: string;
  latest_disclosure?: NationalDisclosure | null;
}

export interface NationalGroupSummary {
  name: string;
  count: number;
  latest_value_yi: number;
  latest_flow_yi: number;
}

export interface NationalEtfMeta {
  generated_at: string;
  latest_market_date: string;
  latest_complete_market_date: string;
  disclosure_latest_date: string;
  scope: string;
  data_state: string;
  etf_count: number;
  latest_complete_market_count?: number;
  latest_complete_market_total?: number;
  official_disclosure_count?: number;
  legacy_disclosure_count?: number;
  disclaimer?: string;
  proxy_source?: string;
  proxy_fetched_at?: string;
}

export interface NationalEtfSnapshot {
  meta: NationalEtfMeta;
  groups: NationalGroupSummary[];
  etfs: NationalEtfItem[];
}

export const EMPTY_NATIONAL_SNAPSHOT: NationalEtfSnapshot = {
  meta: {
    generated_at: "",
    latest_market_date: "",
    latest_complete_market_date: "",
    disclosure_latest_date: "",
    scope: "中央汇金、汇金资管、证金、中国诚通及其公开披露关联主体",
    data_state: "loading",
    etf_count: 0,
  },
  groups: [],
  etfs: [],
};

function fallbackSnapshot(): NationalEtfSnapshot {
  const byCode = new Map<string, NationalEtfItem>();
  FUND_ALLOCATION_SNAPSHOT.etfRows.forEach((row) => {
    const current = byCode.get(row.code);
    if (current) {
      const managers = new Set(`${current.manager || ""} / ${row.holderGroup}`.split(" / ").filter(Boolean));
      current.manager = [...managers].join(" / ");
      return;
    }
    byCode.set(row.code, {
      code: row.code,
      name: row.name,
      manager: row.holderGroup,
      group: `${row.category} / ${row.indexOrTheme}`,
      disclosures: [{
        date: row.asOf,
        ratio_pct: row.ownershipPct,
        value_yi: null,
        total_shares_yi_qfq: row.currentSharesWan / 10000,
        source_label: "本地公开披露基准快照",
        source_status: "fallback",
      }],
      data_source: "公开披露基准快照",
      data_status: "fallback",
      series: [],
      latest_market_date: row.asOf,
      latest_disclosure: { date: row.asOf, ratio_pct: row.ownershipPct, value_yi: null, total_shares_yi_qfq: row.currentSharesWan / 10000 },
    });
  });
  const etfs = [...byCode.values()];
  const groups = [...new Set(etfs.map((item) => item.group))].map((name) => ({
    name,
    count: etfs.filter((item) => item.group === name).length,
    latest_value_yi: 0,
    latest_flow_yi: 0,
  }));
  return {
    meta: {
      generated_at: FUND_ALLOCATION_SNAPSHOT.generatedAt,
      latest_market_date: FUND_ALLOCATION_SNAPSHOT.etfAsOf,
      latest_complete_market_date: FUND_ALLOCATION_SNAPSHOT.etfAsOf,
      disclosure_latest_date: FUND_ALLOCATION_SNAPSHOT.etfAsOf,
      scope: "中央汇金、汇金资管、证金、中国诚通及其公开披露关联主体",
      data_state: "fallback",
      etf_count: etfs.length,
    },
    groups,
    etfs,
  };
}

export async function fetchNationalEtfSnapshot(signal?: AbortSignal, refresh = false): Promise<NationalEtfSnapshot> {
  const response = await fetch(`/api/national-etf${refresh ? "?refresh=true" : ""}`, { signal });
  if (!response.ok) throw new Error(`国家队 ETF 数据请求失败（${response.status}）`);
  const payload = await response.json() as { data?: NationalEtfSnapshot };
  return payload.data?.etfs?.length ? payload.data : fallbackSnapshot();
}

export function getNationalFallbackSnapshot() {
  return fallbackSnapshot();
}
