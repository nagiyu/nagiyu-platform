/**
 * InMemoryChatGuardRepository のユニットテスト。
 *
 * テスト観点:
 * - レート制限: ウィンドウ内カウントアップ、上限ちょうど/超過判定
 * - レート制限: ウィンドウ跨ぎでリセット（新バケット = count 1 に戻る）
 * - 並行制御: ロック取得成功 / 2 本目拒否 / ExpiresAt 失効後の奪取
 * - ロック解放: ownerToken 一致時のみ削除、不一致時はスキップ
 * - 共有ストアへ DynamoDB 実装と同じキー・属性名で保存される
 */

import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryChatGuardRepository } from '../../../src/repositories/in-memory-chat-guard.repository.js';
import type { RateLimitResult } from '../../../src/repositories/chat-guard.repository.interface.js';

// テスト用に固定時刻を使う。
// 時間・分の開始直後（00:00:01 相当）に設定し、境界値テストで確実に同一バケット内に収まるようにする。
// 1 分バケット = 28421760（2024-01-15 10:00:00 UTC 相当）
// 1 時間バケット = 473696（2024-01-15 10:00:00 UTC 相当）
// 時間の開始 = 473696 * 3600000 = 1705305600000（2024-01-15 10:00:00 UTC）
const BASE_HOUR_START_MS = 473_696 * 3_600_000; // 時間の開始ミリ秒
const BASE_NOW_MS = BASE_HOUR_START_MS + 1_000; // 時間の開始から 1 秒後
// 1 分バケット
const BASE_MINUTE_BUCKET = String(Math.floor(BASE_NOW_MS / 60_000));

describe('InMemoryChatGuardRepository - レート制限', () => {
  let store: InMemorySingleTableStore;
  let repo: InMemoryChatGuardRepository;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repo = new InMemoryChatGuardRepository(store);
  });

  it('初回インクリメントは count=1 を返す', async () => {
    const result = await repo.incrementRateLimit('u1', '1m', BASE_NOW_MS);
    expect(result.count).toBe(1);
    expect(result.window).toBe('1m');
  });

  it('同一ウィンドウ内での連続インクリメントは加算される', async () => {
    await repo.incrementRateLimit('u1', '1m', BASE_NOW_MS);
    await repo.incrementRateLimit('u1', '1m', BASE_NOW_MS);
    const result = await repo.incrementRateLimit('u1', '1m', BASE_NOW_MS);
    expect(result.count).toBe(3);
  });

  it('上限ちょうど（count=10）は超過しない', async () => {
    let result: RateLimitResult = { count: 0, window: '1m' };
    for (let i = 0; i < 10; i++) {
      result = await repo.incrementRateLimit('u1', '1m', BASE_NOW_MS);
    }
    expect(result.count).toBe(10);
  });

  it('上限+1（count=11）で超過判定できる', async () => {
    for (let i = 0; i < 11; i++) {
      await repo.incrementRateLimit('u1', '1m', BASE_NOW_MS);
    }
    const result = await repo.incrementRateLimit('u1', '1m', BASE_NOW_MS);
    expect(result.count).toBe(12);
  });

  it('ウィンドウ跨ぎ（60 秒後）でカウントがリセットされる', async () => {
    // 現在のウィンドウで 5 回インクリメント
    for (let i = 0; i < 5; i++) {
      await repo.incrementRateLimit('u1', '1m', BASE_NOW_MS);
    }
    // 60 秒後（新しいウィンドウ）にインクリメント
    const nextWindowMs = BASE_NOW_MS + 60_000;
    const result = await repo.incrementRateLimit('u1', '1m', nextWindowMs);
    // 新しいバケットなので count=1 に戻る
    expect(result.count).toBe(1);
  });

  it('1h ウィンドウは別カウンタを持つ', async () => {
    // 1m を 5 回インクリメント
    for (let i = 0; i < 5; i++) {
      await repo.incrementRateLimit('u1', '1m', BASE_NOW_MS);
    }
    // 1h のカウントは独立している
    const result = await repo.incrementRateLimit('u1', '1h', BASE_NOW_MS);
    expect(result.count).toBe(1);
  });

  it('異なるユーザー間でカウントは独立している', async () => {
    await repo.incrementRateLimit('u1', '1m', BASE_NOW_MS);
    await repo.incrementRateLimit('u1', '1m', BASE_NOW_MS);
    const u2Result = await repo.incrementRateLimit('u2', '1m', BASE_NOW_MS);
    expect(u2Result.count).toBe(1);
  });

  it('カウンタは DynamoDB 実装と同じキー・属性名で保存し、TTL は初回の値を保つ', async () => {
    await repo.incrementRateLimit('u1', '1m', BASE_NOW_MS);
    // 同じウィンドウの後続の呼び出しでは TTL を書き換えない
    await repo.incrementRateLimit('u1', '1m', BASE_NOW_MS + 30_000);

    expect(store.get('USER#u1', `RATELIMIT#1m#${BASE_MINUTE_BUCKET}`)).toEqual({
      PK: 'USER#u1',
      SK: `RATELIMIT#1m#${BASE_MINUTE_BUCKET}`,
      Count: 2,
      TTL: (Number(BASE_MINUTE_BUCKET) + 1) * 60 + 120,
    });
  });
});

describe('InMemoryChatGuardRepository - ロック', () => {
  let store: InMemorySingleTableStore;
  let repo: InMemoryChatGuardRepository;
  const LOCK_TTL_MS = 120_000;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repo = new InMemoryChatGuardRepository(store);
  });

  it('初回取得は acquired=true', async () => {
    const result = await repo.acquireLock('u1', 'token-a', LOCK_TTL_MS, BASE_NOW_MS);
    expect(result.acquired).toBe(true);
    expect(result.ownerToken).toBe('token-a');
  });

  it('有効なロックが存在する場合、2 本目は acquired=false', async () => {
    await repo.acquireLock('u1', 'token-a', LOCK_TTL_MS, BASE_NOW_MS);
    const result = await repo.acquireLock('u1', 'token-b', LOCK_TTL_MS, BASE_NOW_MS);
    expect(result.acquired).toBe(false);
    expect(result.ownerToken).toBeUndefined();
  });

  it('ExpiresAt < now のロックは期限切れとして上書き取得できる', async () => {
    // 今から 1ms 後に期限切れになるロックを取得
    await repo.acquireLock('u1', 'token-a', 1, BASE_NOW_MS);
    // 2ms 後に別リクエストが奪取を試みる（ExpiresAt < nowMs）
    const result = await repo.acquireLock('u1', 'token-b', LOCK_TTL_MS, BASE_NOW_MS + 2);
    expect(result.acquired).toBe(true);
    expect(result.ownerToken).toBe('token-b');
  });

  it('ExpiresAt === now のロックはまだ有効（境界値）', async () => {
    // ExpiresAt = BASE_NOW_MS + LOCK_TTL_MS
    await repo.acquireLock('u1', 'token-a', LOCK_TTL_MS, BASE_NOW_MS);
    // ちょうど ExpiresAt のタイミングはまだ有効（< ではなく <= の場合）
    // InMemory 実装では existing.expiresAt < nowMs で判定するため、
    // ExpiresAt === nowMs のときは「まだ有効」とみなして取得失敗
    const expiredAt = BASE_NOW_MS + LOCK_TTL_MS;
    const result = await repo.acquireLock('u1', 'token-b', LOCK_TTL_MS, expiredAt);
    // ExpiresAt === nowMs の場合は有効（not expired）なので取得失敗
    expect(result.acquired).toBe(false);
  });

  it('異なるユーザーのロックは独立している', async () => {
    await repo.acquireLock('u1', 'token-a', LOCK_TTL_MS, BASE_NOW_MS);
    const result = await repo.acquireLock('u2', 'token-b', LOCK_TTL_MS, BASE_NOW_MS);
    expect(result.acquired).toBe(true);
  });

  it('releaseLock でロックが解放され、再取得できる', async () => {
    await repo.acquireLock('u1', 'token-a', LOCK_TTL_MS, BASE_NOW_MS);
    await repo.releaseLock('u1', 'token-a');
    const result = await repo.acquireLock('u1', 'token-b', LOCK_TTL_MS, BASE_NOW_MS);
    expect(result.acquired).toBe(true);
  });

  it('ownerToken が不一致の場合は releaseLock しても削除されない', async () => {
    await repo.acquireLock('u1', 'token-a', LOCK_TTL_MS, BASE_NOW_MS);
    // 別のトークンで解放を試みる（エラーにならず無視される）
    await repo.releaseLock('u1', 'wrong-token');
    // ロックは残っているはず
    const result = await repo.acquireLock('u1', 'token-b', LOCK_TTL_MS, BASE_NOW_MS);
    expect(result.acquired).toBe(false);
  });

  it('存在しないロックの releaseLock はエラーにならない', async () => {
    await expect(repo.releaseLock('u1', 'nonexistent-token')).resolves.toBeUndefined();
  });

  it('ロックは DynamoDB 実装と同じキー・属性名で保存する', async () => {
    await repo.acquireLock('u1', 'token-a', LOCK_TTL_MS, BASE_NOW_MS);

    const expiresAt = BASE_NOW_MS + LOCK_TTL_MS;
    expect(store.get('USER#u1', 'CHATLOCK')).toEqual({
      PK: 'USER#u1',
      SK: 'CHATLOCK',
      OwnerToken: 'token-a',
      ExpiresAt: expiresAt,
      TTL: Math.floor(expiresAt / 1000) + 300,
    });
  });

  it('期限切れロックを奪取すると所有者と期限が置き換わる', async () => {
    await repo.acquireLock('u1', 'token-a', 1, BASE_NOW_MS);
    await repo.acquireLock('u1', 'token-b', LOCK_TTL_MS, BASE_NOW_MS + 2);

    expect(store.get('USER#u1', 'CHATLOCK')).toMatchObject({
      OwnerToken: 'token-b',
      ExpiresAt: BASE_NOW_MS + 2 + LOCK_TTL_MS,
    });
    // 旧所有者の解放は新しいロックを消さない
    await repo.releaseLock('u1', 'token-a');
    expect(store.get('USER#u1', 'CHATLOCK')).toBeDefined();
  });
});
