import type { LifecycleEntity } from '../entities/lifecycle.entity.js';
import type { MessageEntity } from '../entities/message.entity.js';
import type { NotificationEventEntity } from '../entities/notification-event.entity.js';
import { resolveLifecycleState } from '../lifecycle/state-resolver.js';
import { parseTimeToMinutes } from '../lifecycle/time-utils.js';
import {
  LIFECYCLE_DEFAULT_BEDTIME,
  LIFECYCLE_DEFAULT_WAKE_UP_TIME,
  NOTIFY_ACTIVE_WINDOW_MINUTES,
  NOTIFY_BACKOFF_BASE,
  NOTIFY_BASE_MIN_HOURS,
  NOTIFY_DAILY_CRITICAL_CAP,
  NOTIFY_DAILY_NORMAL_CAP,
  NOTIFY_DAILY_NORMAL_CAP_MAX,
  NOTIFY_DEFAULT_BASE_HOURS,
  NOTIFY_INTENSITY_BASELINE_SESSIONS_PER_DAY,
  NOTIFY_INTENSITY_MAX_FACTOR,
  NOTIFY_INTENSITY_WINDOW_DAYS,
  NOTIFY_MAX_INTERVAL_DAYS,
  NOTIFY_RECENT_SESSION_SAMPLE_N,
  NOTIFY_SESSION_GAP_MINUTES,
} from '../constants.js';

export type ToneBucket = 'normal' | 'long' | 'veryLong';

export type NotifyDecision =
  | { notify: true; kind: 'normal'; toneBucket: ToneBucket; elapsedMs: number }
  | { notify: true; kind: 'critical'; knowledgeId: string }
  | {
      notify: false;
      reason:
        | 'not_due'
        | 'outside_window'
        | 'sleeping'
        | 'daily_cap'
        | 'inactive_stopped'
        | 'no_content';
    };

export interface NotifyDecisionInput {
  /** ユーザー発話メッセージ（role='user'）の履歴。CreatedAt 昇順を推奨。 */
  userMessages: Pick<MessageEntity, 'CreatedAt'>[];
  lifecycle: LifecycleEntity;
  /** ユーザーの通知履歴（CreatedAt 降順）。直近のものから判定に使う。 */
  notificationEvents: NotificationEventEntity[];
  /** クリティカル判定済みの KnowledgeID。空なら通常判定のみ。 */
  criticalKnowledgeId?: string;
  now: Date;
}

/** "HH:00" 形式を分に変換する（parseTimeToMinutes の thin wrapper）。 */
function peakToMinutes(peak: string): number {
  const normalized = peak.includes(':') ? peak : `${peak}:00`;
  return parseTimeToMinutes(normalized);
}

/** 指定時刻が peak ± windowMinutes 以内かを判定する（0時跨ぎ対応）。 */
function isNearPeak(nowMinutes: number, peakMinutes: number, windowMinutes: number): boolean {
  const diff = Math.abs(((nowMinutes - peakMinutes + 720) % 1440) - 720);
  return diff <= windowMinutes;
}

/**
 * 連続メッセージからセッション開始時刻のリストを構築する。
 * `NOTIFY_SESSION_GAP_MINUTES` 以上の空きがあれば新セッション。
 */
export function extractSessionStartTimes(
  userMessages: Pick<MessageEntity, 'CreatedAt'>[],
  sessionGapMs: number
): number[] {
  if (userMessages.length === 0) return [];

  const sorted = [...userMessages].sort((a, b) => a.CreatedAt - b.CreatedAt);
  const starts: number[] = [sorted[0].CreatedAt];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].CreatedAt - sorted[i - 1].CreatedAt >= sessionGapMs) {
      starts.push(sorted[i].CreatedAt);
    }
  }

  return starts;
}

/**
 * セッション開始時刻のリストから隣接セッション間隔（ms）の配列を返す。
 * 直近 N セッションのみを使用する。
 */
export function computeSessionIntervals(sessionStarts: number[], maxSamples: number): number[] {
  if (sessionStarts.length < 2) return [];
  const recent = sessionStarts.slice(-maxSamples);
  const intervals: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    intervals.push(recent[i] - recent[i - 1]);
  }
  return intervals;
}

/** 数値配列の中央値を返す（空配列は null）。 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * 会話の活発さを表す強度係数を算出する（純粋関数）。
 *
 * NOTIFY_INTENSITY_WINDOW_DAYS 内のセッション数を日数で割り session/日 を求め、
 * NOTIFY_INTENSITY_BASELINE_SESSIONS_PER_DAY を基準として正規化する。
 * 結果は [1, NOTIFY_INTENSITY_MAX_FACTOR] にクランプする。
 * casual ユーザー（session/日 < baseline）は factor=1 となり従来通りの挙動を維持する。
 */
export function computeIntensityFactor(sessionStarts: number[], now: Date): number {
  const windowMs = NOTIFY_INTENSITY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const since = now.getTime() - windowMs;
  const sessionsInWindow = sessionStarts.filter((t) => t >= since).length;
  const perDay = sessionsInWindow / NOTIFY_INTENSITY_WINDOW_DAYS;
  const factor = perDay / NOTIFY_INTENSITY_BASELINE_SESSIONS_PER_DAY;
  return Math.max(1, Math.min(NOTIFY_INTENSITY_MAX_FACTOR, factor));
}

/**
 * 基準間隔（ms）を算出する。
 * - サンプルが 0 なら DEFAULT_BASE_HOURS
 * - 中央値を intensityFactor で割ることで活発ユーザーの間隔を短縮
 * - [NOTIFY_BASE_MIN_HOURS, NOTIFY_MAX_INTERVAL_DAYS] にクランプ
 */
export function computeBaseIntervalMs(sessionIntervals: number[], intensityFactor: number): number {
  const minMs = NOTIFY_BASE_MIN_HOURS * 60 * 60 * 1000;
  const maxMs = NOTIFY_MAX_INTERVAL_DAYS * 24 * 60 * 60 * 1000;
  const defaultMs = NOTIFY_DEFAULT_BASE_HOURS * 60 * 60 * 1000;

  const med = median(sessionIntervals);
  if (med === null) return defaultMs;

  return Math.max(minMs, Math.min(maxMs, med / intensityFactor));
}

/**
 * 1 日あたりの平常通知上限（動的 cap）を算出する（純粋関数）。
 *
 * intensityFactor を丸めた値を使い、
 * [NOTIFY_DAILY_NORMAL_CAP, NOTIFY_DAILY_NORMAL_CAP_MAX] にクランプする。
 * casual（factor=1）→ cap=1、活発（factor≥3）→ cap=3。
 */
export function computeDailyNormalCap(intensityFactor: number): number {
  return Math.max(
    NOTIFY_DAILY_NORMAL_CAP,
    Math.min(NOTIFY_DAILY_NORMAL_CAP_MAX, Math.round(intensityFactor))
  );
}

/** 現在の elapsed に対するトーンバケットを返す。 */
export function resolveToneBucket(elapsedMs: number): ToneBucket {
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  const twoWeeks = 14 * 24 * 60 * 60 * 1000;
  if (elapsedMs >= twoWeeks) return 'veryLong';
  if (elapsedMs >= oneWeek) return 'long';
  return 'normal';
}

/**
 * 本日（JST 0時〜）以降に送った種別の通知件数を返す。
 * now は TZ=Asia/Tokyo 前提。
 */
export function countTodayNotifications(
  events: NotificationEventEntity[],
  kind: 'normal' | 'critical',
  now: Date
): number {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();

  return events.filter((e) => e.Kind === kind && e.CreatedAt >= todayStartMs).length;
}

/**
 * 平常通知の発火判定（純粋関数）。
 *
 * 判定順序:
 *   1. 睡眠帯チェック（クリティカル・平常問わず先頭で判定）
 *   2. クリティカル判定（睡眠帯以外の時間帯・間隔ゲートをバイパス）
 *   3. 停止チェック（effectiveInterval > 14日）
 *   4. 1日上限チェック
 *   5. 活動時間帯チェック
 *   6. 適応的間隔チェック
 *
 * クリティカルは睡眠帯を尊重する（深夜に叩き起こさない）。
 * 睡眠中は起床後の次回バッチで再評価され、遅延配信される。
 */
export function shouldNotifyNow(input: NotifyDecisionInput): NotifyDecision {
  const { userMessages, lifecycle, notificationEvents, criticalKnowledgeId, now } = input;

  // 1. 睡眠帯チェック（クリティカル・平常問わず最優先）
  const bedtime = lifecycle.Bedtime ?? LIFECYCLE_DEFAULT_BEDTIME;
  const wakeUpTime = lifecycle.WakeUpTime ?? LIFECYCLE_DEFAULT_WAKE_UP_TIME;
  const lifecycleState = resolveLifecycleState(now, bedtime, wakeUpTime);
  if (lifecycleState === 'sleeping') {
    return { notify: false, reason: 'sleeping' };
  }

  // 2. クリティカル判定（睡眠帯以外は時間帯・間隔ゲートをバイパス）
  if (criticalKnowledgeId) {
    const todayCritical = countTodayNotifications(notificationEvents, 'critical', now);
    if (todayCritical < NOTIFY_DAILY_CRITICAL_CAP) {
      return { notify: true, kind: 'critical', knowledgeId: criticalKnowledgeId };
    }
    // cap 到達時は平常判定へフォールスルー
  }

  // --- 平常通知判定 ---

  const sessionGapMs = NOTIFY_SESSION_GAP_MINUTES * 60 * 1000;
  const sessionStarts = extractSessionStartTimes(userMessages, sessionGapMs);
  const intervals = computeSessionIntervals(sessionStarts, NOTIFY_RECENT_SESSION_SAMPLE_N);

  // 強度係数を算出して interval・cap 両方に反映（活発ユーザーほど短間隔・高 cap）
  const intensityFactor = computeIntensityFactor(sessionStarts, now);
  const baseIntervalMs = computeBaseIntervalMs(intervals, intensityFactor);

  // 直近の平常通知と最終会話時刻の後ろ側を基準時刻とする
  const lastNormalEvent = notificationEvents.find((e) => e.Kind === 'normal');
  const lastNormalAt = lastNormalEvent?.CreatedAt ?? 0;
  const lastInteractionAt =
    userMessages.length > 0 ? Math.max(...userMessages.map((m) => m.CreatedAt)) : 0;
  const referenceTime = Math.max(lastInteractionAt, lastNormalAt);

  // missedCount = lastInteractionAt 以降に送った平常通知の件数
  const missedCount = notificationEvents.filter(
    (e) => e.Kind === 'normal' && e.CreatedAt > lastInteractionAt
  ).length;

  const effectiveIntervalMs = baseIntervalMs * Math.pow(NOTIFY_BACKOFF_BASE, missedCount);
  const maxMs = NOTIFY_MAX_INTERVAL_DAYS * 24 * 60 * 60 * 1000;

  // 3. 停止チェック
  if (effectiveIntervalMs > maxMs) {
    return { notify: false, reason: 'inactive_stopped' };
  }

  // 4. 1日上限チェック（活発ユーザーは cap が引き上がる）
  const dailyCap = computeDailyNormalCap(intensityFactor);
  const todayNormal = countTodayNotifications(notificationEvents, 'normal', now);
  if (todayNormal >= dailyCap) {
    return { notify: false, reason: 'daily_cap' };
  }

  // 5. 活動時間帯チェック
  const activityProfile = lifecycle.UserActivityProfile;
  if (activityProfile) {
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const morningPeakMins = peakToMinutes(activityProfile.morningPeak);
    const eveningPeakMins = peakToMinutes(activityProfile.eveningPeak);
    const inWindow =
      isNearPeak(nowMinutes, morningPeakMins, NOTIFY_ACTIVE_WINDOW_MINUTES) ||
      isNearPeak(nowMinutes, eveningPeakMins, NOTIFY_ACTIVE_WINDOW_MINUTES);
    if (!inWindow) {
      return { notify: false, reason: 'outside_window' };
    }
  }
  // UserActivityProfile 未学習なら時間帯ゲートをスキップ（活動時間が不明）

  // 6. 適応的間隔チェック
  const elapsedMs = now.getTime() - referenceTime;
  if (elapsedMs < effectiveIntervalMs) {
    return { notify: false, reason: 'not_due' };
  }

  // 発火（ネタがないケースはバッチ側でチェックするが、referenceTime=0 は初回扱いで通す）
  const toneBucket = resolveToneBucket(elapsedMs);
  return { notify: true, kind: 'normal', toneBucket, elapsedMs };
}
