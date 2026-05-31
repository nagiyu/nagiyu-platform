import type {
  CreateLifecycleInput,
  LifecycleEntity,
  LifecycleKey,
  UpdateLifecycleInput,
} from '../entities/lifecycle.entity.js';

/**
 * ユーザー × キャラの生活サイクルリポジトリ。
 *
 * Phase 4b では get のみ使用（デフォルト値フォールバックは usecase 層で行う）。
 * upsert は Phase 4c 以降のスケジュール設定 UI から使用する。
 */
export interface LifecycleRepository {
  get(key: LifecycleKey): Promise<LifecycleEntity | null>;
  upsert(input: CreateLifecycleInput, updates?: UpdateLifecycleInput): Promise<LifecycleEntity>;
}
