import type { UserActivityProfile } from '../entities/lifecycle.entity.js';
import { parseTimeToMinutes, formatMinutesToTime, smoothTime, clampTime } from './time-utils.js';

export interface AdaptationOptions {
  offsetHours: {
    /** wakeUpTime = morningPeak - wakeUp 時間（キャラはユーザーより早めに起きる）*/
    wakeUp: number;
    /** bedtime = eveningPeak + bedtime 時間（キャラはユーザーより遅めに寝る）*/
    bedtime: number;
  };
  /** smoothing 係数。new = current * (1 - α) + target * α */
  smoothing: number;
}

const DEFAULT_ADAPTATION_OPTIONS: AdaptationOptions = {
  offsetHours: { wakeUp: 1, bedtime: 1.5 },
  smoothing: 0.3,
};

// wakeUpTime クランプ範囲: 05:00〜12:00
const WAKE_UP_CLAMP_MIN = 5 * 60; // 300
const WAKE_UP_CLAMP_MAX = 12 * 60; // 720

// bedtime クランプ範囲: 21:00〜翌04:00（0時跨ぎ）
const BEDTIME_CLAMP_MIN = 21 * 60; // 1260
const BEDTIME_CLAMP_MAX = 4 * 60; // 240

/**
 * ユーザー活動プロファイルを元に、キャラの就寝/起床時刻を緩やかに適応させる。
 *
 * - 完全同期はせず offsetHours 分ズラして独立した存在感を保つ
 * - smoothing で急激な変化を防ぐ（移動平均的に shift）
 * - userProfile が未学習（null/undefined）の場合は current をそのまま返す
 */
export function adaptCharacterSchedule(
  current: { bedtime: string; wakeUpTime: string },
  userProfile: UserActivityProfile | undefined | null,
  options: AdaptationOptions = DEFAULT_ADAPTATION_OPTIONS
): { bedtime: string; wakeUpTime: string } {
  if (!userProfile) {
    return current;
  }

  const currentWakeUp = parseTimeToMinutes(current.wakeUpTime);
  const currentBedtime = parseTimeToMinutes(current.bedtime);

  const morningPeakMin = parseTimeToMinutes(userProfile.morningPeak);
  const eveningPeakMin = parseTimeToMinutes(userProfile.eveningPeak);

  const targetWakeUp = ((morningPeakMin - options.offsetHours.wakeUp * 60) % 1440 + 1440) % 1440;
  const targetBedtime = (eveningPeakMin + options.offsetHours.bedtime * 60) % 1440;

  // 移動平均で緩やかに shift（clamp は smooth 後に適用）
  const newWakeUp = clampTime(
    smoothTime(currentWakeUp, targetWakeUp, options.smoothing),
    WAKE_UP_CLAMP_MIN,
    WAKE_UP_CLAMP_MAX
  );
  const newBedtime = clampTime(
    smoothTime(currentBedtime, targetBedtime, options.smoothing),
    BEDTIME_CLAMP_MIN,
    BEDTIME_CLAMP_MAX
  );

  return {
    bedtime: formatMinutesToTime(newBedtime),
    wakeUpTime: formatMinutesToTime(newWakeUp),
  };
}
