import { ACCEPT_FAILURE_MESSAGE, resolveAcceptFailureMessage } from '@/lib/invitation-errors';
import { ERROR_MESSAGES } from '@/lib/constants/errors';

describe('resolveAcceptFailureMessage', () => {
  it('エラーコードが MEMBER_LIMIT_EXCEEDED の場合は人数上限の文言を返す', async () => {
    const response = {
      json: async () => ({
        error: 'MEMBER_LIMIT_EXCEEDED',
        message: ERROR_MESSAGES.MEMBER_LIMIT_EXCEEDED,
      }),
    };

    await expect(resolveAcceptFailureMessage(response)).resolves.toBe(
      ERROR_MESSAGES.MEMBER_LIMIT_EXCEEDED
    );
  });

  it.each([
    ['別のエラーコード', { error: 'ALREADY_RESPONDED', message: 'x' }],
    ['エラーコードなし', {}],
    ['null', null],
    ['文字列', 'MEMBER_LIMIT_EXCEEDED'],
  ])('%s の場合は既定の文言を返す', async (_label, body) => {
    await expect(resolveAcceptFailureMessage({ json: async () => body })).resolves.toBe(
      ACCEPT_FAILURE_MESSAGE
    );
  });

  it('本文が JSON として読めない場合は既定の文言を返す', async () => {
    const response = {
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    };

    await expect(resolveAcceptFailureMessage(response)).resolves.toBe(ACCEPT_FAILURE_MESSAGE);
  });
});
