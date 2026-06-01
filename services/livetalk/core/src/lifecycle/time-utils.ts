/** "HH:mm" → 0〜1439 の分数に変換する */
export function parseTimeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return ((h * 60 + m) % 1440 + 1440) % 1440;
}

/** 0〜1439 の分数（mod 1440 自動適用）を "HH:mm" に変換する */
export function formatMinutesToTime(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = Math.round(normalized % 60);
  const hh = m === 60 ? (h + 1) % 24 : h;
  const mm = m === 60 ? 0 : m;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * 円環（24h）上で currentMinutes から targetMinutes へ alpha 割合で移動する。
 * 最短経路（max 720 分）を使うため、0時跨ぎでも正しく補間できる。
 */
export function smoothTime(currentMinutes: number, targetMinutes: number, alpha: number): number {
  let diff = targetMinutes - currentMinutes;
  if (diff > 720) diff -= 1440;
  if (diff < -720) diff += 1440;
  return ((currentMinutes + alpha * diff) % 1440 + 1440) % 1440;
}

/**
 * 時刻（分）を [minMinutes, maxMinutes] にクランプする。
 * minMinutes <= maxMinutes: 通常範囲。
 * minMinutes > maxMinutes: 0時跨ぎ範囲（例: 21:00〜翌04:00 = [1260, 240]）。
 */
export function clampTime(minutes: number, minMinutes: number, maxMinutes: number): number {
  const normalized = ((minutes % 1440) + 1440) % 1440;

  if (minMinutes <= maxMinutes) {
    return Math.max(minMinutes, Math.min(maxMinutes, normalized));
  }

  // 跨ぎ範囲: 有効ゾーンは [minMinutes, 1439] ∪ [0, maxMinutes]
  if (normalized >= minMinutes || normalized <= maxMinutes) {
    return normalized;
  }

  // 範囲外（maxMinutes < normalized < minMinutes）→ 最近傍境界へ
  const distToMin = minMinutes - normalized; // 前方距離
  const distToMax = normalized - maxMinutes; // 後方距離
  return distToMin <= distToMax ? minMinutes : maxMinutes;
}
