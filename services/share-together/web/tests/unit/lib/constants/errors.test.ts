import { ERROR_MESSAGES } from '@/lib/constants/errors';

describe('ERROR_MESSAGES', () => {
  it('主要なエラーメッセージを日本語で提供する', () => {
    expect(ERROR_MESSAGES.UNAUTHORIZED).toBe('認証が必要です');
    expect(ERROR_MESSAGES.DEFAULT_LIST_NOT_DELETABLE).toBe('デフォルトリストは削除できません');
  });
});
