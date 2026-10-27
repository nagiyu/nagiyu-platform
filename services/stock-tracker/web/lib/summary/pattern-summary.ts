import {
  PATTERN_REGISTRY,
  type DailySummaryEntity,
  type PatternStatus,
} from '@nagiyu/stock-tracker-core';

export interface PatternDetailResponse {
  patternId: string;
  name: string;
  description: string;
  signalType: 'BUY' | 'SELL';
  status: PatternStatus;
}

export interface PatternSummaryResponse {
  buyPatternCount: number;
  sellPatternCount: number;
  patternDetails: PatternDetailResponse[];
}

/**
 * 日次サマリーを、API 応答に載せるパターン関連の値に変換する
 *
 * 保存用の Mapper に応答用の形を持たせると、保存形式の変更と API の形が連動してしまうため、
 * 応答への変換は API 側に置く。パターン判定が未実行のサマリーは件数 0・詳細なしで返す。
 *
 * @param entity - 日次サマリー
 * @returns 買い・売りシグナルの合致数と、判定済みパターンの詳細
 */
export function toPatternSummary(entity: DailySummaryEntity): PatternSummaryResponse {
  if (!entity.patternResults) {
    return {
      buyPatternCount: 0,
      sellPatternCount: 0,
      patternDetails: [],
    };
  }

  const patternDetails = PATTERN_REGISTRY.flatMap((pattern) => {
    const status = entity.patternResults?.[pattern.definition.patternId];

    if (!status) {
      return [];
    }

    return [
      {
        ...pattern.definition,
        status,
      },
    ];
  });

  return {
    buyPatternCount: entity.buyPatternCount ?? 0,
    sellPatternCount: entity.sellPatternCount ?? 0,
    patternDetails,
  };
}
