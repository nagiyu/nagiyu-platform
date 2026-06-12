/**
 * InMemoryChatGuardRepository のユニットテスト（Issue #3528）。
 *
 * テスト観点:
 * - レート制限: ウィンドウ内カウントアップ、上限ちょうど/超過判定
 * - レート制限: ウィンドウ跨ぎでリセット（新バケット = count 1 に戻る）
 * - 並行制御: ロック取得成功 / 2 本目拒否 / ExpiresAt 失効後の奪取
 * - ロック解放: ownerToken 一致時のみ削除、不一致時はスキップ
 * - computeBucket / computeWindowExpiresAtSec の純粋ロジック
 */

import {
  InMemoryChatGuardRepository,
  computeBucket,
  computeWindowExpiresAtSec,
} from '../../../src/repositories/in-memory-chat-guard.repository.js';
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
// 1 時間バケット
const BASE_HOUR_BUCKET = String(Math.floor(BASE_NOW_MS / 3_600_000));

describe('computeBucket()', () => {
  it('1m: エポック分を返す', () => {
    expect(computeBucket('1m', BASE_NOW_MS)).toBe(BASE_MINUTE_BUCKET);
  });

  it('1h: エポック時を返す', () => {
    expect(computeBucket('1h', BASE_NOW_MS)).toBe(BASE_HOUR_BUCKET);
  });

  it('1m: 分の境界直前は同じバケット', () => {
    // 現在の分バケットの終了直前（次の分の開始 - 1ms）
    const nextMinuteStartMs = (Math.floor(BASE_NOW_MS / 60_000) + 1) * 60_000;
    const justBeforeNextMinute = nextMinuteStartMs - 1;
    expect(computeBucket('1m', justBeforeNextMinute)).toBe(BASE_MINUTE_BUCKET);
  });

  it('1m: 次の分の開始は新しいバケット', () => {
    const nextMinuteStartMs = (Math.floor(BASE_NOW_MS / 60_000) + 1) * 60_000;
    expect(computeBucket('1m', nextMinuteStartMs)).toBe(String(Math.floor(BASE_NOW_MS / 60_000) + 1));
  });

  it('1h: 時間の境界直前は同じバケット', () => {
    // 現在の時間バケットの終了直前（次の時間の開始 - 1ms）
    const nextHourStartMs = (Math.floor(BASE_NOW_MS / 3_600_000) + 1) * 3_600_000;
    const justBeforeNextHour = nextHourStartMs - 1;
    expect(computeBucket('1h', justBeforeNextHour)).toBe(BASE_HOUR_BUCKET);
  });

  it('1h: 次の時間の開始は新しいバケット', () => {
    const nextHourStartMs = (Math.floor(BASE_NOW_MS / 3_600_000) + 1) * 3_600_000;
    expect(computeBucket('1h', nextHourStartMs)).toBe(String(Math.floor(BASE_NOW_MS / 3_600_000) + 1));
  });
});

describe('computeWindowExpiresAtSec()', () => {
  it('1m: 次の分の開始 Unix 秒を返す', () => {
    const expected = (Math.floor(BASE_NOW_MS / 60_000) + 1) * 60;
    expect(computeWindowExpiresAtSec('1m', BASE_NOW_MS)).toBe(expected);
  });

  it('1h: 次の時間の開始 Unix 秒を返す', () => {
    const expected = (Math.floor(BASE_NOW_MS / 3_600_000) + 1) * 3_600;
    expect(computeWindowExpiresAtSec('1h', BASE_NOW_MS)).toBe(expected);
  });
});

describe('InMemoryChatGuardRepository - レート制限', () => {
  let repo: InMemoryChatGuardRepository;

  beforeEach(() => {
    repo = new InMemoryChatGuardRepository();
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

  it('TTL 切れのエントリは新規扱いになる', async () => {
    // 現在のウィンドウでインクリメント（expiresAt は nextMinute）
    const nowSec = Math.floor(BASE_NOW_MS / 1000);
    // 現在のウィンドウの expiresAt = (floor(nowMs/60000) + 1) * 60
    const windowExpiresSec = (Math.floor(BASE_NOW_MS / 60_000) + 1) * 60;
    // TTL 切れ後の時刻（windowExpiresSec + 1 秒後）
    const expiredMs = (windowExpiresSec + 1) * 1000;

    // まず現在のバケットでカウントをためる
    for (let i = 0; i < 5; i++) {
      await repo.incrementRateLimit('u1', '1m', BASE_NOW_MS);
    }

    // TTL 切れ後は同バケット文字列でも期限切れ扱いで count=1 に戻る
    // （InMemory 実装は nowSec > expiresAt で判定する）
    // expiredMs のバケット = floor(expiredMs / 60000)
    // これは BASE_NOW_MS のバケット +1 以上になる（60 秒以上経過している）
    const result = await repo.incrementRateLimit('u1', '1m', expiredMs);
    // 新しいバケットなので count=1
    expect(result.count).toBe(1);
    expect(result.count).toBeLessThan(6);

    // nowSec が expiresAt を超えている場合のリセット確認（同一バケットキーのシミュレーション）
    // InMemory 実装では nowSec <= expiresAt の場合は継続カウント、
    // nowSec > expiresAt の場合は count=1 にリセットする
    void nowSec;
  });
});

describe('InMemoryChatGuardRepository - ロック', () => {
  let repo: InMemoryChatGuardRepository;
  const LOCK_TTL_MS = 120_000;

  beforeEach(() => {
    repo = new InMemoryChatGuardRepository();
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

  it('clear() で全エントリが削除される', async () => {
    await repo.acquireLock('u1', 'token-a', LOCK_TTL_MS, BASE_NOW_MS);
    await repo.incrementRateLimit('u1', '1m', BASE_NOW_MS);
    repo.clear();
    const lockResult = await repo.acquireLock('u1', 'token-b', LOCK_TTL_MS, BASE_NOW_MS);
    const rateResult = await repo.incrementRateLimit('u1', '1m', BASE_NOW_MS);
    expect(lockResult.acquired).toBe(true);
    expect(rateResult.count).toBe(1);
  });
});
