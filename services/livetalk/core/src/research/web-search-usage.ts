import type { ResponseOutputItem } from 'openai/resources/responses/responses';
import { logger } from '@nagiyu/common';
import type { WebSearchCallCounts } from './types.js';

/**
 * Web 検索回数ログのメッセージ。CloudWatch Logs Insights の検索キーになるため export する。
 * トークンの `[llm-usage]` ログとはメッセージを分け、トークン用の集計クエリに混ざらないようにする。
 */
export const WEB_SEARCH_USAGE_LOG_MESSAGE = '[web-search-usage] Web 検索回数';

/**
 * `response.output` の `web_search_call` 項目を数える。
 *
 * 課金単位は tool call であり、1 回のリサーチで search / open_page / find_in_page が
 * 混在するため、合計に加えて action 別の内訳も返す。
 * SDK に無い action が来ても合計から落とさないよう `other` に寄せる。
 * 計測の失敗が本処理を壊してはならないため、output が配列でなくても 0 件として扱う。
 */
export function countWebSearchCalls(output: ResponseOutputItem[] | undefined): WebSearchCallCounts {
  const counts: WebSearchCallCounts = {
    total: 0,
    search: 0,
    openPage: 0,
    findInPage: 0,
    other: 0,
  };
  if (!Array.isArray(output)) {
    return counts;
  }

  for (const item of output) {
    if (item.type !== 'web_search_call') {
      continue;
    }
    counts.total++;
    switch (item.action?.type) {
      case 'search':
        counts.search++;
        break;
      case 'open_page':
        counts.openPage++;
        break;
      case 'find_in_page':
        counts.findInPage++;
        break;
      default:
        counts.other++;
    }
  }
  return counts;
}

/**
 * リサーチ 1 回分の Web 検索回数を構造化ログとして出す。
 * `[llm-usage]` ログと service / purpose / model / reasoningEffort / outcome を揃え、
 * 同じキーで突き合わせられるようにする。集計しやすいようフラットな context に載せる。
 */
export function logWebSearchUsage(input: {
  service: string;
  purpose: string;
  model: string;
  reasoningEffort?: string;
  outcome?: string;
  counts: WebSearchCallCounts;
}): void {
  const { counts, ...keys } = input;
  logger.info(WEB_SEARCH_USAGE_LOG_MESSAGE, {
    ...keys,
    webSearchCalls: counts.total,
    webSearchSearch: counts.search,
    webSearchOpenPage: counts.openPage,
    webSearchFindInPage: counts.findInPage,
    webSearchOther: counts.other,
  });
}
