import type { NotificationEventEntity } from '../entities/notification-event.entity.js';
import { countTodayNotifications } from './decision.js';

/**
 * ユーザー総量調停の入力。
 *
 * criticalCandidates はキャラ独立で全件送る。
 * normalCandidates からは 1 バッチにつき最大 1 体を選抜する。
 */
export interface SelectNotificationsInput {
  /** クリティカル通知の発火候補（キャラ単位の cap は decision 側で担保済み） */
  criticalCandidates: { characterId: string }[];
  /**
   * 通常通知の発火候補。
   * lastNormalAt = そのキャラの直近 normal 通知の CreatedAt（未通知は 0）。
   * 最も古い（最も通知していない）キャラを優先する公平性選抜に使用する。
   */
  normalCandidates: { characterId: string; lastNormalAt: number }[];
  /** ユーザー全キャラの通知履歴（全体の daily cap チェックに使用） */
  allUserEvents: NotificationEventEntity[];
  /** 判定基準時刻 */
  now: Date;
  /** 1 日あたりの通常通知最大件数（ユーザー総量） */
  userDailyNormalCap: number;
}

/**
 * ユーザー総量調停の出力。
 */
export interface SelectNotificationsResult {
  /** 送るべきクリティカル通知のキャラ ID 一覧（全件） */
  criticalCharacterIds: string[];
  /**
   * 送るべき通常通知のキャラ ID（1 体のみ）。
   * 1 日上限到達済みまたは候補なしの場合は null。
   */
  normalCharacterId: string | null;
}

/**
 * ユーザー総量調停の純粋関数。
 *
 * - critical: 全候補を送る（キャラ独立）
 * - normal: 1 バッチにつき最大 1 体選抜
 *   - ユーザー全体の本日 normal 送信数が cap 以上なら null
 *   - 未満なら lastNormalAt が最小（最も長く通知していない）のキャラを選ぶ
 *   - 同値の場合は characterId 昇順で安定選択
 */
export function selectNotificationsToSend(
  input: SelectNotificationsInput
): SelectNotificationsResult {
  const { criticalCandidates, normalCandidates, allUserEvents, now, userDailyNormalCap } = input;

  // critical は全候補を送る
  const criticalCharacterIds = criticalCandidates.map((c) => c.characterId);

  // normal: ユーザー全体の本日 normal 件数を確認
  const todayNormalCount = countTodayNotifications(allUserEvents, 'normal', now);
  if (todayNormalCount >= userDailyNormalCap || normalCandidates.length === 0) {
    return { criticalCharacterIds, normalCharacterId: null };
  }

  // lastNormalAt 最小（未通知=0 が最優先）のキャラを選ぶ。同値は characterId 昇順で安定選択。
  const sorted = [...normalCandidates].sort((a, b) => {
    if (a.lastNormalAt !== b.lastNormalAt) {
      return a.lastNormalAt - b.lastNormalAt;
    }
    return a.characterId < b.characterId ? -1 : 1;
  });

  return { criticalCharacterIds, normalCharacterId: sorted[0].characterId };
}
