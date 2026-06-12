/**
 * ChatGuardRepository の InMemory 実装。
 *
 * テスト・ローカル開発用。スレッドセーフは保証しない（Node.js のシングルスレッドを前提とする）。
 */

import { buildUserPK } from '../mappers/keys.js';
import type {
  AcquireLockResult,
  ChatGuardRepository,
  RateLimitResult,
  RateLimitWindow,
} from './chat-guard.repository.interface.js';

interface RateLimitEntry {
  count: number;
  /** Unix 秒 */
  expiresAt: number;
}

interface LockEntry {
  ownerToken: string;
  /** Unix ミリ秒 */
  expiresAt: number;
}

/**
 * ウィンドウバケットキーを組み立てるヘルパー。
 * `USER#<userId>` PK 配下の `RATELIMIT#<window>#<bucket>` SK に相当する。
 */
function buildRateLimitKey(userId: string, window: RateLimitWindow, bucket: string): string {
  return `${buildUserPK(userId)}:RATELIMIT#${window}#${bucket}`;
}

/**
 * ロックキーを組み立てるヘルパー。
 * `USER#<userId>` PK 配下の `CHATLOCK` SK に相当する。
 */
function buildLockKey(userId: string): string {
  return `${buildUserPK(userId)}:CHATLOCK`;
}

/**
 * 現在時刻からバケット文字列を算出する。
 * - '1m': エポック分（floor(nowMs / 60000)）
 * - '1h': エポック時（floor(nowMs / 3600000)）
 */
export function computeBucket(window: RateLimitWindow, nowMs: number): string {
  if (window === '1m') return String(Math.floor(nowMs / 60_000));
  return String(Math.floor(nowMs / 3_600_000));
}

/**
 * ウィンドウ満了 Unix 秒（TTL 用）を算出する。
 * - '1m': 次の分の開始（+1 バケット）
 * - '1h': 次の時間の開始（+1 バケット）
 */
export function computeWindowExpiresAtSec(window: RateLimitWindow, nowMs: number): number {
  if (window === '1m') {
    return (Math.floor(nowMs / 60_000) + 1) * 60;
  }
  return (Math.floor(nowMs / 3_600_000) + 1) * 3_600;
}

export class InMemoryChatGuardRepository implements ChatGuardRepository {
  /** レートリミットエントリのマップ（key = buildRateLimitKey の戻り値） */
  private readonly rateLimitStore: Map<string, RateLimitEntry> = new Map();
  /** ロックエントリのマップ（key = buildLockKey の戻り値） */
  private readonly lockStore: Map<string, LockEntry> = new Map();

  public async incrementRateLimit(
    userId: string,
    window: RateLimitWindow,
    nowMs: number
  ): Promise<RateLimitResult> {
    const bucket = computeBucket(window, nowMs);
    const key = buildRateLimitKey(userId, window, bucket);
    const expiresAt = computeWindowExpiresAtSec(window, nowMs);

    const existing = this.rateLimitStore.get(key);
    // 既存アイテムが TTL 切れの場合は新規扱い
    const nowSec = Math.floor(nowMs / 1000);
    const isExpired = existing !== undefined && existing.expiresAt <= nowSec;

    if (!existing || isExpired) {
      this.rateLimitStore.set(key, { count: 1, expiresAt });
      return { count: 1, window };
    }

    const newCount = existing.count + 1;
    this.rateLimitStore.set(key, { count: newCount, expiresAt: existing.expiresAt });
    return { count: newCount, window };
  }

  public async acquireLock(
    userId: string,
    ownerToken: string,
    lockTtlMs: number,
    nowMs: number
  ): Promise<AcquireLockResult> {
    const key = buildLockKey(userId);
    const existing = this.lockStore.get(key);

    // アイテムが存在しないか、ExpiresAt が過去（期限切れ）の場合はロック取得
    if (!existing || existing.expiresAt < nowMs) {
      this.lockStore.set(key, { ownerToken, expiresAt: nowMs + lockTtlMs });
      return { acquired: true, ownerToken };
    }

    // ロックが有効な場合は取得失敗
    return { acquired: false };
  }

  public async releaseLock(userId: string, ownerToken: string): Promise<void> {
    const key = buildLockKey(userId);
    const existing = this.lockStore.get(key);

    // ownerToken が一致する場合のみ削除（他リクエストのロックを消さない）
    if (existing && existing.ownerToken === ownerToken) {
      this.lockStore.delete(key);
    }
    // ownerToken 不一致・アイテムなし（既に失効・奪取済み）は握りつぶす
  }

  /**
   * テスト用: 全エントリをクリアする。
   */
  public clear(): void {
    this.rateLimitStore.clear();
    this.lockStore.clear();
  }
}
