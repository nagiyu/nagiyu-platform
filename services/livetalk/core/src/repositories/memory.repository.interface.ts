import type { CreateMemoryInput, MemoryEntity, MemoryKey, Tier, UpdateMemoryInput } from '../entities/memory.entity.js';

export interface MemoryRepository {
  /**
   * メモリを保存する。`MemoryID` 未指定時は ULID を自動採番する。
   * TTL（Tier C: 30 日 / Tier D: 1 日）はリポジトリ側で自動付与する。
   */
  put(memory: CreateMemoryInput): Promise<MemoryEntity>;

  /**
   * 単一メモリを取得する。
   */
  get(key: MemoryKey): Promise<MemoryEntity | null>;

  /**
   * 指定 Tier のメモリを全件取得する。
   */
  listByTier(userId: string, characterId: string, tier: Tier): Promise<MemoryEntity[]>;

  /**
   * 指定カテゴリのメモリを Tier 横断で全件取得する。
   */
  listByCategory(userId: string, characterId: string, category: string): Promise<MemoryEntity[]>;

  /**
   * メモリの可変フィールドを更新する。
   */
  update(memory: UpdateMemoryInput): Promise<MemoryEntity>;

  /**
   * メモリを削除する。
   */
  delete(key: MemoryKey): Promise<void>;

  /**
   * メモリを上位 Tier に昇格する（SK 変更を伴う delete + put のトランザクション）。
   */
  promote(memory: MemoryEntity, toTier: Tier): Promise<MemoryEntity>;

  /**
   * メモリを下位 Tier に降格する（SK 変更を伴う delete + put のトランザクション）。
   */
  demote(memory: MemoryEntity, toTier: Tier): Promise<MemoryEntity>;
}
