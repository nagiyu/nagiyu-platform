/**
 * チャットのレート制限ウィンドウ計算のユニットテスト。
 */

import {
  computeBucket,
  computeLockTtlSec,
  computeWindowTtlSec,
} from '../../../src/lib/chat-guard-window.js';

// 1 時間の開始から 1 秒後（境界値テストで同一バケット内に収める）
const BASE_NOW_MS = 473_696 * 3_600_000 + 1_000;

describe('computeBucket()', () => {
  it('1m: エポック分を返す', () => {
    expect(computeBucket('1m', BASE_NOW_MS)).toBe(String(Math.floor(BASE_NOW_MS / 60_000)));
  });

  it('1h: エポック時を返す', () => {
    expect(computeBucket('1h', BASE_NOW_MS)).toBe('473696');
  });

  it('1m: 分の境界直前は同じバケット、境界ちょうどは次のバケット', () => {
    const nextMinuteStartMs = (Math.floor(BASE_NOW_MS / 60_000) + 1) * 60_000;
    expect(computeBucket('1m', nextMinuteStartMs - 1)).toBe(computeBucket('1m', BASE_NOW_MS));
    expect(computeBucket('1m', nextMinuteStartMs)).toBe(
      String(Math.floor(BASE_NOW_MS / 60_000) + 1)
    );
  });

  it('1h: 時間の境界直前は同じバケット、境界ちょうどは次のバケット', () => {
    const nextHourStartMs = (473_696 + 1) * 3_600_000;
    expect(computeBucket('1h', nextHourStartMs - 1)).toBe('473696');
    expect(computeBucket('1h', nextHourStartMs)).toBe('473697');
  });
});

describe('computeWindowTtlSec()', () => {
  it('1m: 次の分の開始 + 120 秒のバッファを返す', () => {
    expect(computeWindowTtlSec('1m', BASE_NOW_MS)).toBe(
      (Math.floor(BASE_NOW_MS / 60_000) + 1) * 60 + 120
    );
  });

  it('1h: 次の時間の開始 + 7200 秒のバッファを返す', () => {
    expect(computeWindowTtlSec('1h', BASE_NOW_MS)).toBe((473_696 + 1) * 3_600 + 7_200);
  });
});

describe('computeLockTtlSec()', () => {
  it('ロック満了の Unix 秒に 300 秒のバッファを加える', () => {
    expect(computeLockTtlSec(1_705_312_200_999)).toBe(1_705_312_200 + 300);
  });
});
