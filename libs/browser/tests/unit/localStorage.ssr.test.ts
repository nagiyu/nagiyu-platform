/**
 * @jest-environment node
 */

/**
 * window が無い環境 (SSR) での localStorage ユーティリティのテスト
 *
 * jsdom 環境の window は削除も再定義もできない Node のバージョンがあるため、
 * window の無い状態は node 環境で作る。
 */

import { getItem } from '../../src/localStorage';

describe('localStorage (SSR)', () => {
  it('windowが存在しない場合はnullを返す', () => {
    expect(typeof globalThis.window).toBe('undefined');

    expect(getItem('testKey')).toBe(null);
  });
});
