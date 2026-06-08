/**
 * job-status.ts のユニットテスト
 *
 * determineBatchJobStatus の判定ロジックを検証する。
 */

import { determineBatchJobStatus } from '../../src/lib/job-status.js';

describe('determineBatchJobStatus', () => {
  describe('全件失敗（FAILED）', () => {
    it('success=0, failed=2 のとき FAILED を返す', () => {
      expect(determineBatchJobStatus(0, 2)).toBe('FAILED');
    });

    it('success=0, failed=1 のとき FAILED を返す', () => {
      expect(determineBatchJobStatus(0, 1)).toBe('FAILED');
    });

    it('success=0, failed=100 のとき FAILED を返す', () => {
      expect(determineBatchJobStatus(0, 100)).toBe('FAILED');
    });
  });

  describe('全件成功（SUCCEEDED）', () => {
    it('success=3, failed=0 のとき SUCCEEDED を返す', () => {
      expect(determineBatchJobStatus(3, 0)).toBe('SUCCEEDED');
    });

    it('success=1, failed=0 のとき SUCCEEDED を返す', () => {
      expect(determineBatchJobStatus(1, 0)).toBe('SUCCEEDED');
    });
  });

  describe('一部失敗（SUCCEEDED 扱い）', () => {
    it('success=1, failed=1 のとき SUCCEEDED を返す', () => {
      expect(determineBatchJobStatus(1, 1)).toBe('SUCCEEDED');
    });

    it('success=5, failed=3 のとき SUCCEEDED を返す', () => {
      expect(determineBatchJobStatus(5, 3)).toBe('SUCCEEDED');
    });
  });

  describe('境界値（success=0, failed=0）', () => {
    it('success=0, failed=0 のとき SUCCEEDED を返す', () => {
      // 実運用では発生しないが、関数仕様として success=0 AND failed=0 は全件失敗の条件を満たさないため SUCCEEDED
      expect(determineBatchJobStatus(0, 0)).toBe('SUCCEEDED');
    });
  });
});
