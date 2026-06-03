/**
 * ユーザー × キャラの生活サイクル設定。
 *
 * `docs/services/livetalk/architecture.md` §3「データモデル概要」の SK パターン `CHAR#<id>#LIFECYCLE` に対応。
 *
 * Phase 4b スコープでは Bedtime / WakeUpTime をデフォルト固定で運用する。
 * ユーザーが自分でスケジュールを変更できる UI は Phase 4c 以降で実装する。
 * Phase 4c 学習バッチで UserActivityProfile が追加される。
 */

export type LifecycleState = 'awake' | 'sleeping';

/** ユーザー活動時間の学習結果（Phase 4c バッチが書き込む）。 */
export interface UserActivityProfile {
  /** 最も活発な午前時間帯。"HH:00" 形式。 */
  morningPeak: string;
  /** 最も活発な夜時間帯。"HH:00" 形式。 */
  eveningPeak: string;
  /** 学習に使ったメッセージ数。 */
  sampleSize: number;
  /** 最終学習日時（ISO8601）。 */
  lastLearnedAt: string;
}

export interface LifecycleEntity {
  UserID: string;
  CharacterID: string;
  /** 就寝時刻。"HH:mm" 形式（例: "01:30"） */
  Bedtime: string;
  /** 起床時刻。"HH:mm" 形式（例: "09:30"） */
  WakeUpTime: string;
  /** ユーザー活動時間学習結果（Phase 4c バッチが書き込むまでは undefined）。 */
  UserActivityProfile?: UserActivityProfile;
  CreatedAt: number;
  UpdatedAt: number;
}

export interface LifecycleKey {
  userId: string;
  characterId: string;
}

export type CreateLifecycleInput = Omit<LifecycleEntity, 'CreatedAt' | 'UpdatedAt'>;
export type UpdateLifecycleInput = Partial<Pick<LifecycleEntity, 'Bedtime' | 'WakeUpTime'>>;
