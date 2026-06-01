import type { LifecycleRepository } from '../repositories/lifecycle.repository.interface.js';
import type { MessageRepository } from '../repositories/message.repository.interface.js';
import { buildHourlyHistogram, findPeakInRange } from '../lifecycle/histogram.js';

const DEFAULT_MORNING_PEAK = '08:00';
const DEFAULT_EVENING_PEAK = '21:00';
const DEFAULT_SAMPLE_SIZE_THRESHOLD = 5;
const DEFAULT_LOOKBACK_DAYS = 30;

export interface LearnUserActivityParams {
  messageRepo: MessageRepository;
  lifecycleRepo: LifecycleRepository;
  now?: () => Date;
  /** 学習に必要な最低メッセージ数（デフォルト: 5）。 */
  sampleSizeThreshold?: number;
  /** 遡る日数（デフォルト: 30 日）。 */
  lookbackDays?: number;
  /** 時刻変換に使うタイムゾーン（デフォルト: 'Asia/Tokyo'）。 */
  timezone?: string;
}

/**
 * 1 ユーザー × 1 キャラの過去発話から活動時間を学習し LIFECYCLE に保存する。
 *
 * サンプル数が閾値未満の場合はスキップ（ノイズ防止）。
 */
export async function learnUserActivity(
  userId: string,
  characterId: string,
  params: LearnUserActivityParams
): Promise<'learned' | 'skipped'> {
  const {
    messageRepo,
    lifecycleRepo,
    now = () => new Date(),
    sampleSizeThreshold = DEFAULT_SAMPLE_SIZE_THRESHOLD,
    lookbackDays = DEFAULT_LOOKBACK_DAYS,
    timezone = 'Asia/Tokyo',
  } = params;

  const nowDate = now();
  const sinceMs = nowDate.getTime() - lookbackDays * 24 * 60 * 60 * 1000;

  const allMessages = await messageRepo.listSince(userId, characterId, sinceMs);
  const userMessages = allMessages.filter((m) => m.Role === 'user');

  if (userMessages.length < sampleSizeThreshold) {
    return 'skipped';
  }

  const histogram = buildHourlyHistogram(userMessages, timezone);

  // morning: 5〜12 時、evening: 17〜翌 2 時（wrap-around）
  const morningPeak = findPeakInRange(histogram, 5, 12) ?? DEFAULT_MORNING_PEAK;
  const eveningPeak = findPeakInRange(histogram, 17, 26) ?? DEFAULT_EVENING_PEAK;

  await lifecycleRepo.updateUserActivityProfile(
    { userId, characterId },
    {
      morningPeak,
      eveningPeak,
      sampleSize: userMessages.length,
      lastLearnedAt: nowDate.toISOString(),
    }
  );

  return 'learned';
}
