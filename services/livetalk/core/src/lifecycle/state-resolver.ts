import type { LifecycleState } from '../entities/lifecycle.entity.js';
import {
  LIFECYCLE_DEFAULT_BEDTIME,
  LIFECYCLE_DEFAULT_WAKE_UP_TIME,
} from '../constants.js';

/**
 * "HH:mm" 文字列を 0:00 からの分数に変換する。
 */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * 現在時刻・就寝時刻・起床時刻から LifecycleState を決定する純粋関数。
 *
 * 深夜 0 時跨ぎに対応するため 2 パターンで判定する:
 *   - bed < wake（例: 02:00–09:30）: m >= bed && m < wake で sleeping
 *   - bed >= wake（例: 23:30–09:30）: m >= bed || m < wake で sleeping
 *
 * @param now      判定基準の Date（TZ=Asia/Tokyo が前提）
 * @param bedtime  就寝時刻 "HH:mm"（省略時はデフォルト定数を使用）
 * @param wakeUpTime 起床時刻 "HH:mm"（省略時はデフォルト定数を使用）
 */
export function resolveLifecycleState(
  now: Date,
  bedtime: string = LIFECYCLE_DEFAULT_BEDTIME,
  wakeUpTime: string = LIFECYCLE_DEFAULT_WAKE_UP_TIME
): LifecycleState {
  const m = now.getHours() * 60 + now.getMinutes();
  const bed = toMinutes(bedtime);
  const wake = toMinutes(wakeUpTime);

  const sleeping =
    bed < wake
      ? m >= bed && m < wake
      : m >= bed || m < wake;

  return sleeping ? 'sleeping' : 'awake';
}
