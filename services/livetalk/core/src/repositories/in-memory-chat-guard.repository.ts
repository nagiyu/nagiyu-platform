/**
 * ChatGuardRepository の InMemory 実装。
 *
 * テスト・ローカル開発用。DynamoDB 実装と同じ PK / SK・属性名で共有ストアに保存する。
 * アカウント削除が `USER#<userId>` 配下をまとめて消すため、独立した Map に持つと
 * DynamoDB と挙動がずれる。スレッドセーフは保証しない（Node.js のシングルスレッドを前提とする）。
 */

import { type DynamoDBKey, type InMemorySingleTableStore } from '@nagiyu/aws';
import { computeBucket, computeLockTtlSec, computeWindowTtlSec } from '../lib/chat-guard-window.js';
import { buildChatLockSK, buildChatRateLimitSK, buildUserPK } from '../mappers/keys.js';
import type {
  AcquireLockResult,
  ChatGuardRepository,
  RateLimitResult,
  RateLimitWindow,
} from './chat-guard.repository.interface.js';

export class InMemoryChatGuardRepository implements ChatGuardRepository {
  private readonly store: InMemorySingleTableStore;

  constructor(store: InMemorySingleTableStore) {
    this.store = store;
  }

  public async incrementRateLimit(
    userId: string,
    window: RateLimitWindow,
    nowMs: number
  ): Promise<RateLimitResult> {
    const key: DynamoDBKey = {
      PK: buildUserPK(userId),
      SK: buildChatRateLimitSK(window, computeBucket(window, nowMs)),
    };
    const existing = this.store.getByKey(key);

    // バケットがキーに含まれるため、ウィンドウが変わると別アイテムになる。
    // DynamoDB 実装も TTL を参照せず加算するので、期限の判定は行わない。
    const count = ((existing?.['Count'] as number | undefined) ?? 0) + 1;
    // TTL は初回のみ設定し、ウィンドウ内の自然な満了を保つ（DynamoDB 実装の if_not_exists と同じ）
    const ttlSec = (existing?.['TTL'] as number | undefined) ?? computeWindowTtlSec(window, nowMs);

    this.store.putByKey(key, { ...key, Count: count, TTL: ttlSec });
    return { count, window };
  }

  public async acquireLock(
    userId: string,
    ownerToken: string,
    lockTtlMs: number,
    nowMs: number
  ): Promise<AcquireLockResult> {
    const key: DynamoDBKey = { PK: buildUserPK(userId), SK: buildChatLockSK() };
    const existing = this.store.getByKey(key);

    // 未取得か、ExpiresAt が過去（期限切れ）のときだけ取得できる。
    // ExpiresAt === now はまだ有効（DynamoDB 実装の `ExpiresAt < :now` と同じ）。
    if (existing !== undefined && !((existing['ExpiresAt'] as number) < nowMs)) {
      return { acquired: false };
    }

    const expiresAt = nowMs + lockTtlMs;
    this.store.putByKey(key, {
      ...key,
      OwnerToken: ownerToken,
      ExpiresAt: expiresAt,
      TTL: computeLockTtlSec(expiresAt),
    });
    return { acquired: true, ownerToken };
  }

  public async releaseLock(userId: string, ownerToken: string): Promise<void> {
    const key: DynamoDBKey = { PK: buildUserPK(userId), SK: buildChatLockSK() };
    const existing = this.store.getByKey(key);

    // ownerToken が一致する場合のみ削除する（他リクエストのロックを消さない）。
    // 不一致・アイテムなし（既に失効・奪取済み）は握りつぶす。
    if (existing?.['OwnerToken'] === ownerToken) {
      this.store.deleteByKey(key);
    }
  }
}
