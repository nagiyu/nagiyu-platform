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

// テスト用に固定時刻を使う。
// 時間・分の開始直後（00:00:01 相当）に設定し、境界値テストで確実に同一バケット内に収まるようにする。
// 1 分バケット = 28421760（2024-01-15 10:00:00 UTC 相当）
// 1 時間バケット = 473696（2024-01-15 10:00:00 UTC 相当）
// 時間の開始 = 473696 * 3600000 = 1705305600000（2024-01-15 10:00:00 UTC）
const BASE_HOUR_START_MS = 473_696 * 3_600_000; // 時間の開始ミリ秒
const BASE_NOW_MS = BASE_HOUR_START_MS + 1_000; // 時間の開始から 1 秒後
// 1 分バケット
const BASE_MINUTE_BUCKET = String(Math.floor(BASE_NOW_MS / 60_000));

const HOUR_BUCKET = String(Math.floor(BASE_NOW_MS / 3_600_000));
const LIMITS = { perMinute: 3, perHour: 5 };

describe('InMemoryChatGuardRepository - レート制限', () => {
  let store: InMemorySingleTableStore;
  let repo: InMemoryChatGuardRepository;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repo = new InMemoryChatGuardRepository(store);
  });

  const consume = (userId = 'u1', nowMs = BASE_NOW_MS, limits = LIMITS) =>
    repo.tryConsumeRateLimit(userId, nowMs, limits);

  const countOf = (window: '1m' | '1h', bucket: string) =>
    store.get('USER#u1', `RATELIMIT#${window}#${bucket}`)?.['Count'];

  it('両方の窓が上限未満なら通し、両方を数える', async () => {
    expect(await consume()).toEqual({ allowed: true });
    expect(countOf('1m', BASE_MINUTE_BUCKET)).toBe(1);
    expect(countOf('1h', HOUR_BUCKET)).toBe(1);
  });

  it('1 分の上限ちょうどまでは通し、その次は 1 分の窓で断る', async () => {
    for (let i = 0; i < 3; i++) {
      expect(await consume()).toEqual({ allowed: true });
    }
    expect(await consume()).toEqual({ allowed: false, window: '1m' });
  });

  it('1 分で断られたとき、1 時間は増えない', async () => {
    for (let i = 0; i < 3; i++) await consume();
    await consume();
    expect(countOf('1m', BASE_MINUTE_BUCKET)).toBe(3);
    expect(countOf('1h', HOUR_BUCKET)).toBe(3);
  });

  it('1 時間で断られたとき、先に数えた 1 分を戻す', async () => {
    // 分をまたいで 1 時間の上限 5 を使い切る
    for (let minute = 0; minute < 5; minute++) {
      await consume('u1', BASE_NOW_MS + minute * 60_000);
    }
    const nowMs = BASE_NOW_MS + 5 * 60_000;
    const bucket = String(Math.floor(nowMs / 60_000));

    expect(await consume('u1', nowMs)).toEqual({ allowed: false, window: '1h' });
    expect(countOf('1m', bucket)).toBe(0);
    expect(countOf('1h', HOUR_BUCKET)).toBe(5);
  });

  it('断られ続けても 1 時間の回数が増えない', async () => {
    for (let i = 0; i < 3; i++) await consume();
    for (let i = 0; i < 20; i++) await consume();
    expect(countOf('1h', HOUR_BUCKET)).toBe(3);
  });

  it('1 分の窓を跨ぐと 1 分の回数が戻る', async () => {
    for (let i = 0; i < 3; i++) await consume();
    expect(await consume('u1', BASE_NOW_MS + 60_000)).toEqual({ allowed: true });
  });

  it('異なるユーザー間でカウントは独立している', async () => {
    for (let i = 0; i < 3; i++) await consume();
    expect(await consume('u2')).toEqual({ allowed: true });
  });

  it('DynamoDB 実装と同じキー・属性名・Type・TTL で保存する', async () => {
    await consume();
    // 同じ窓の後続の呼び出しでは TTL を書き換えない
    await consume('u1', BASE_NOW_MS + 30_000);

    expect(store.get('USER#u1', `RATELIMIT#1m#${BASE_MINUTE_BUCKET}`)).toMatchObject({
      PK: 'USER#u1',
      SK: `RATELIMIT#1m#${BASE_MINUTE_BUCKET}`,
      Count: 2,
      TTL: (Number(BASE_MINUTE_BUCKET) + 1) * 60 + 120,
      Type: 'ChatRateLimit',
    });
    expect(store.get('USER#u1', `RATELIMIT#1h#${HOUR_BUCKET}`)).toMatchObject({
      PK: 'USER#u1',
      SK: `RATELIMIT#1h#${HOUR_BUCKET}`,
      Count: 2,
      TTL: (Number(HOUR_BUCKET) + 1) * 3_600 + 7_200,
      Type: 'ChatRateLimit',
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
