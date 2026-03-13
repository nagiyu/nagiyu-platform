import { describe, it, expect, beforeEach } from '@jest/globals';
import { getBatchClient, clearBatchClientCache } from '../../../src/batch/index.js';

describe('Batch Client', () => {
  beforeEach(() => {
    clearBatchClientCache();
    delete process.env.AWS_REGION;
  });

  it('同一リージョンではシングルトンを返す', () => {
    const first = getBatchClient('ap-northeast-1');
    const second = getBatchClient('ap-northeast-1');

    expect(first).toBe(second);
  });

  it('リージョンが異なる場合は別インスタンスを返す', () => {
    const first = getBatchClient('ap-northeast-1');
    const second = getBatchClient('us-east-1');

    expect(first).not.toBe(second);
  });

  it('キャッシュクリア後は新しいインスタンスを返す', () => {
    const first = getBatchClient('ap-northeast-1');
    clearBatchClientCache();
    const second = getBatchClient('ap-northeast-1');

    expect(first).not.toBe(second);
  });
});
