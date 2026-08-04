import test from "node:test";
import assert from "node:assert/strict";
import { countMacroItems, filterDeskMacroGroups } from "../src/lib/intel-macro-filter.ts";

function group(items) {
  return [{ key: "macro", name: "财经 / 宏观", accent: "#eab308", total: items.length, items }];
}

test("排除个股盘中异动和非投资信息", () => {
  const result = filterDeskMacroGroups(group([
    { title: "仲景食品7月28日快速上涨", url: "", time: "", source: "东方财富股票" },
    { title: "沪电股份7月28日打开跌停", url: "", time: "", source: "东方财富股票" },
    { title: "限制进食8小时或有助保持头脑敏锐", url: "", time: "", source: "MarketWatch" },
    { title: "美联储公布最新利率决议", url: "", time: "", source: "华尔街见闻" },
  ]));

  assert.equal(countMacroItems(result), 1);
  assert.equal(result[0].items[0].title, "美联储公布最新利率决议");
});

test("保留能改变投资判断的宏观事件，排除泛观点", () => {
  const result = filterDeskMacroGroups(group([
    { title: "Oil extends losses as U.S.-Iran hostilities ease", url: "", time: "", source: "CNBC" },
    { title: "6月CPI同比上涨2.8%", url: "", time: "", source: "国家统计局" },
    { title: "China needs a new growth model", url: "", time: "", source: "Financial Times" },
    { title: "创业板跌超5%，半导体承压，老铺黄金大跌", url: "", time: "", source: "华尔街见闻" },
    { title: "某公司发布新车型", url: "", time: "", source: "经济观察网" },
  ]));

  assert.deepEqual(result[0].items.map((item) => item.title), [
    "6月CPI同比上涨2.8%",
    "Oil extends losses as U.S.-Iran hostilities ease",
  ]);
  assert.ok(result[0].items.every((item) => item.investmentScore >= 55));
});

test("同一事件聚为一条并用多源确认提高置信度", () => {
  const result = filterDeskMacroGroups(group([
    { title: "美联储公布7月利率决议", url: "1", time: "", source: "华尔街见闻" },
    { title: "Fed releases July interest rate decision", url: "2", time: "", source: "CNBC" },
    { title: "美国CPI同比上涨3.1%", url: "3", time: "", source: "来源甲" },
  ]));

  const fedEvent = result[0].items.find((item) => item.clusterId.startsWith("monetary-fed"));
  assert.equal(fedEvent.clusterSize, 2);
  assert.equal(fedEvent.sourceCount, 2);
  assert.equal(fedEvent.relatedItems.length, 1);
  assert.deepEqual(Object.keys(fedEvent.scoreBreakdown), ["impact", "relevance", "evidence", "novelty", "actionability"]);
  assert.ok(Object.values(fedEvent.scoreBreakdown).every((value) => value >= 0));
  assert.ok(fedEvent.scoreReasons.some((reason) => reason.includes("交叉确认")));
});

test("同一主体的不同宏观事件不被粗暴合并", () => {
  const result = filterDeskMacroGroups(group([
    { title: "美联储公布7月利率决议", url: "1", time: "", source: "CNBC" },
    { title: "Fed raises rates by 25 bps", url: "2", time: "", source: "Reuters" },
  ]));

  assert.equal(countMacroItems(result), 2);
  assert.ok(result[0].items.every((item) => item.clusterSize === 1));
});

test("来源层级进入代码评分，但不替代投资相关性门槛", () => {
  const t1 = filterDeskMacroGroups(group([
    { title: "央行公布最新货币政策决定", url: "1", time: "", source: "自定义官方源", tier: "T1" },
  ]))[0].items[0];
  const t2 = filterDeskMacroGroups(group([
    { title: "央行公布最新货币政策决定", url: "2", time: "", source: "自定义转载源", tier: "T2" },
  ]))[0].items[0];

  assert.ok(t1.investmentScore > t2.investmentScore);
  assert.ok(t1.scoreReasons[0].includes("T1"));
  assert.ok(t2.scoreReasons[0].includes("一般公开来源"));
});

test("不再用单一来源条数上限误伤重要信息", () => {
  const result = filterDeskMacroGroups(group([
    { title: "美联储公布利率决议", url: "1", time: "", source: "来源甲" },
    { title: "美国CPI同比上涨3.1%", url: "2", time: "", source: "来源甲" },
    { title: "美国非农就业新增25万人", url: "3", time: "", source: "来源甲" },
    { title: "美国10年期国债收益率升至4.5%", url: "4", time: "", source: "来源甲" },
  ]));

  assert.equal(countMacroItems(result), 4);
});
