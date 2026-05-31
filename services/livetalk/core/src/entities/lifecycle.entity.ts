/**
 * ユーザー × キャラの生活サイクル設定。
 *
 * `tasks/livetalk/design.md` 3.2 節 SK パターン `CHAR#<id>#LIFECYCLE` に対応。
 *
 * Phase 4b スコープでは Bedtime / WakeUpTime をデフォルト固定で運用する。
 * ユーザーが自分でスケジュールを変更できる UI は Phase 4c 以降で実装する。
 */

export type LifecycleState = 'awake' | 'sleeping';

export interface LifecycleEntity {
  UserID: string;
  CharacterID: string;
  /** 就寝時刻。"HH:mm" 形式（例: "01:30"） */
  Bedtime: string;
  /** 起床時刻。"HH:mm" 形式（例: "09:30"） */
  WakeUpTime: string;
  CreatedAt: number;
  UpdatedAt: number;
}

export interface LifecycleKey {
  userId: string;
  characterId: string;
}

export type CreateLifecycleInput = Omit<LifecycleEntity, 'CreatedAt' | 'UpdatedAt'>;
export type UpdateLifecycleInput = Partial<Pick<LifecycleEntity, 'Bedtime' | 'WakeUpTime'>>;
