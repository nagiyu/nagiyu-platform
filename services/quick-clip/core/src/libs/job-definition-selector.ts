export type JobDefinitionSize = 'small' | 'large' | 'xlarge';

// Job Definition の選択は「サイズ軸」「尺(duration)軸」の2軸で行う。
// - サイズ軸: 動画ファイルのダウンロード・展開に必要なメモリ / ストレージ量を規定する
// - 尺軸: FFmpeg 処理に必要な CPU 量・処理時間を規定する
//   (処理時間は vCPU 数と FFmpeg 並列数(最大10)で決まる。ADR-009/013 参照)
// 小サイズ×長尺(低ビットレート動画)のように、サイズ軸だけでは
// CPU/時間が不足するケースを救うため、両軸の判定結果のうち大きい方を採用する。

const ONE_GIB = 1024 * 1024 * 1024;
const FOUR_GIB = 4 * ONE_GIB;

// 尺軸の閾値(秒)。dev 環境での実測をもとに調整する暫定値。
const NINETY_MINUTES_SEC = 90 * 60;
const ONE_HUNDRED_EIGHTY_MINUTES_SEC = 180 * 60;

// Job Definition の「重さ」の順序。max 判定に使用する。
const TIER_ORDER: Record<JobDefinitionSize, number> = {
  small: 0,
  large: 1,
  xlarge: 2,
};

const maxTier = (a: JobDefinitionSize, b: JobDefinitionSize): JobDefinitionSize =>
  TIER_ORDER[a] >= TIER_ORDER[b] ? a : b;

// サイズ軸: メモリ/ストレージ要件を規定する(従来のロジックを維持)
const sizeTier = (fileSize: number): JobDefinitionSize => {
  if (fileSize < ONE_GIB) {
    return 'small';
  }

  if (fileSize < FOUR_GIB) {
    return 'large';
  }

  return 'xlarge';
};

// 尺軸: CPU/処理時間要件を規定する。durationSec 未指定時は昇格させない(従来互換)
const durationTier = (durationSec: number | undefined): JobDefinitionSize => {
  if (durationSec === undefined) {
    return 'small';
  }

  if (durationSec < NINETY_MINUTES_SEC) {
    return 'small';
  }

  if (durationSec < ONE_HUNDRED_EIGHTY_MINUTES_SEC) {
    return 'large';
  }

  return 'xlarge';
};

export const selectJobDefinition = (fileSize: number, durationSec?: number): JobDefinitionSize =>
  maxTier(sizeTier(fileSize), durationTier(durationSec));
