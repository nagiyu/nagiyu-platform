import { ACCEPT_FAILURE_MESSAGE, resolveInvitationFailure } from '@/lib/invitation-errors';
import { ERROR_MESSAGES } from '@/lib/constants/errors';

describe('resolveInvitationFailure', () => {
  it('エラーコードが MEMBER_LIMIT_EXCEEDED の場合は人数上限の文言を返す', async () => {
    const response = {
      json: async () => ({
        error: 'MEMBER_LIMIT_EXCEEDED',
        message: ERROR_MESSAGES.MEMBER_LIMIT_EXCEEDED,
      }),
    };

    await expect(resolveInvitationFailure(response, ACCEPT_FAILURE_MESSAGE)).resolves.toEqual({
      message: ERROR_MESSAGES.MEMBER_LIMIT_EXCEEDED,
      removeFromList: false,
    });
  });

  it('エラーコードが INVITATION_EXPIRED の場合は期限切れの文言を返し、一覧から除く', async () => {
    const response = {
      json: async () => ({
        error: 'INVITATION_EXPIRED',
        message: ERROR_MESSAGES.INVITATION_EXPIRED,
      }),
    };

    await expect(resolveInvitationFailure(response, ACCEPT_FAILURE_MESSAGE)).resolves.toEqual({
      message: '招待の有効期限が切れています',
      removeFromList: true,
    });
  });

  it.each([
    ['別のエラーコード', { error: 'ALREADY_RESPONDED', message: 'x' }],
    ['エラーコードなし', {}],
    ['null', null],
    ['文字列', 'MEMBER_LIMIT_EXCEEDED'],
  ])('%s の場合は既定の文言を返す', async (_label, body) => {
    await expect(
      resolveInvitationFailure({ json: async () => body }, ACCEPT_FAILURE_MESSAGE)
    ).resolves.toEqual({ message: ACCEPT_FAILURE_MESSAGE, removeFromList: false });
  });

  it('本文が JSON として読めない場合は既定の文言を返す', async () => {
    const response = {
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    };

    await expect(resolveInvitationFailure(response, '既定')).resolves.toEqual({
      message: '既定',
      removeFromList: false,
    });
  });
});
