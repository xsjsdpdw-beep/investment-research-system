import type { Announcement, GlobalIndex, MarketOverview, NewsItem, NewsRadarConfig, ResearchHubData, TurnoverTop } from "@/lib/api";

type WatchlistStock = {
  code: string;
  market: string;
  name: string;
  group: string;
};

type WatchlistData = {
  stocks: WatchlistStock[];
  indicators: unknown[];
  updated_at: string;
};

export type IntelStockFeedItem = {
  ticker: string;
  name: string;
  group: string;
  announcements: Announcement[];
  news: NewsItem[];
  highlights: string[];
};

export type IntelRefreshResult = {
  hubData: ResearchHubData;
  overview: MarketOverview | null;
  globals: GlobalIndex[];
  turnover: TurnoverTop | null;
  configData: NewsRadarConfig | null;
  stockFeeds: IntelStockFeedItem[];
};

export async function runIntelRefresh({
  forceRadarRefresh,
  refreshRadar,
  loadHub,
  loadMarketOverview,
  loadGlobalIndices,
  loadTurnoverTop,
  loadWatchlist,
  loadNewsSourcesConfig,
  loadAnnouncements,
  loadNews,
}: {
  forceRadarRefresh: boolean;
  refreshRadar: () => Promise<unknown>;
  loadHub: () => Promise<ResearchHubData>;
  loadMarketOverview: () => Promise<MarketOverview | null>;
  loadGlobalIndices: () => Promise<GlobalIndex[]>;
  loadTurnoverTop: () => Promise<TurnoverTop | null>;
  loadWatchlist: () => Promise<WatchlistData>;
  loadNewsSourcesConfig: () => Promise<NewsRadarConfig | null>;
  loadAnnouncements: (code: string) => Promise<Announcement[]>;
  loadNews: (code: string) => Promise<NewsItem[]>;
}): Promise<IntelRefreshResult> {
  if (forceRadarRefresh) {
    await refreshRadar();
  }

  const [hubData, overview, globals, turnover, watchlistData, configData] = await Promise.all([
    loadHub(),
    loadMarketOverview(),
    loadGlobalIndices(),
    loadTurnoverTop(),
    loadWatchlist(),
    loadNewsSourcesConfig(),
  ]);

  const watchStocks = watchlistData.stocks.slice(0, 8);
  const stockFeeds = await Promise.all(watchStocks.map(async (item) => {
    const [announcements, news] = await Promise.all([
      loadAnnouncements(item.code),
      loadNews(item.code),
    ]);

    return {
      ticker: `${item.code}.${item.market}`,
      name: item.name,
      group: item.group,
      announcements: announcements.slice(0, 3),
      news: news.slice(0, 2),
      highlights: [
        announcements[0]?.title ? `公告：${announcements[0].title}` : "",
        news[0]?.新闻标题 ? `新闻：${news[0].新闻标题}` : "",
      ].filter(Boolean),
    };
  }));

  return {
    hubData,
    overview,
    globals,
    turnover,
    configData,
    stockFeeds,
  };
}
