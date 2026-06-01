import type {
  CreateLifecycleInput,
  LifecycleEntity,
  LifecycleKey,
  UpdateLifecycleInput,
  UserActivityProfile,
} from '../entities/lifecycle.entity.js';

/**
 * ユーザー × キャラの生活サイクルリポジトリ。
 *
 * Phase 4b では get のみ使用（デフォルト値フォールバックは usecase 層で行う）。
 * upsert は Phase 4c 以降のスケジュール設定 UI から使用する。
 * updateUserActivityProfile は Phase 4c 学習バッチが使用する。
 */
export interface LifecycleRepository {
  get(key: LifecycleKey): Promise<LifecycleEntity | null>;
  upsert(input: CreateLifecycleInput, updates?: UpdateLifecycleInput): Promise<LifecycleEntity>;
  /**
   * ユーザー活動時間プロファイルを更新する。
   * 既存 LIFECYCLE アイテムがなければデフォルト値で新規作成する。
   */
  updateUserActivityProfile(
    key: LifecycleKey,
    profile: UserActivityProfile
  ): Promise<LifecycleEntity>;

  /**
   * キャラの就寝/起床スケジュールを更新する（Phase 4d 適応バッチが使用）。
   * 既存の UserActivityProfile は保持する。
   * 既存 LIFECYCLE アイテムがなければデフォルト値で新規作成する。
   */
  updateSchedule(
    key: LifecycleKey,
    schedule: { bedtime: string; wakeUpTime: string }
  ): Promise<LifecycleEntity>;
}
