import {
  CHAT_ERROR_MESSAGES,
  getChatErrorMessage,
  readChatErrorCode,
} from '@/lib/home/chat-error-messages';

describe('getChatErrorMessage', () => {
  it('RATE_LIMIT_EXCEEDED は休憩を促す文言', () => {
    expect(getChatErrorMessage('RATE_LIMIT_EXCEEDED')).toBe(
      'たくさん話してくれてありがとう。ちょっとだけ休憩させてね。少し時間を置いてからまた話しかけてね'
    );
  });

  it('CONCURRENT_REQUEST は待つよう促す文言', () => {
    expect(getChatErrorMessage('CONCURRENT_REQUEST')).toBe(
      'いま別のお返事を考えてるところだよ。終わるまで少し待ってね'
    );
  });

  it.each([undefined, null, '', 'UNKNOWN_CODE'])('%p は汎用文言', (code) => {
    expect(getChatErrorMessage(code)).toBe(
      'ちょっとごめんね、今うまく話せないみたい。少ししてからもう一度話しかけてね'
    );
    expect(getChatErrorMessage(code)).toBe(CHAT_ERROR_MESSAGES.GENERIC);
  });
});

describe('readChatErrorCode', () => {
  const makeResponse = (json: () => Promise<unknown>) => ({ json }) as unknown as Response;

  it('error コードを読み取る', async () => {
    const res = makeResponse(async () => ({ error: 'RATE_LIMIT_EXCEEDED', message: 'x' }));
    await expect(readChatErrorCode(res)).resolves.toBe('RATE_LIMIT_EXCEEDED');
  });

  it('JSON が読めなければ null', async () => {
    const res = makeResponse(async () => {
      throw new SyntaxError('invalid');
    });
    await expect(readChatErrorCode(res)).resolves.toBeNull();
  });

  it.each([null, 'text', {}, { error: 1 }])('想定外の本文 %p は null', async (body) => {
    await expect(readChatErrorCode(makeResponse(async () => body))).resolves.toBeNull();
  });
});
