import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  isSnsSubscribeUrl,
  validateSnsMessage,
  type SnsMessage,
} from '../../../src/notify/sns-validator.js';

let validateMock: jest.Mock;

jest.mock('sns-validator', () => {
  return jest.fn().mockImplementation(() => ({
    validate: (...args: unknown[]) => validateMock(...args),
  }));
});

describe('validateSnsMessage', () => {
  beforeEach(() => {
    validateMock = jest.fn();
    validateMock.mockReset();
  });

  it('署名検証に成功したメッセージを返す', async () => {
    const message: SnsMessage = {
      Type: 'Notification',
      Message: 'alarm fired',
    };

    validateMock.mockImplementation((input, callback) => {
      callback(null, input);
    });

    const result = await validateSnsMessage(message);

    expect(result).toEqual(message);
  });

  it('署名検証失敗時にエラーを投げる', async () => {
    const message: SnsMessage = {
      Type: 'Notification',
      Message: 'invalid',
    };

    validateMock.mockImplementation((_input, callback) => {
      callback(new Error('invalid signature'));
    });

    await expect(validateSnsMessage(message)).rejects.toThrow('SNS 署名の検証に失敗しました');
  });

  it('不正なメッセージ形式の場合はエラーを投げる', async () => {
    await expect(validateSnsMessage(null)).rejects.toThrow('SNS メッセージが不正です');
  });
});

describe('isSnsSubscribeUrl', () => {
  it.each([
    'https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&Token=abc',
    'https://sns.ap-northeast-1.amazonaws.com/?Action=ConfirmSubscription&Token=abc',
  ])('AWS SNS の確認用 URL (%s) は true を返す', (url) => {
    expect(isSnsSubscribeUrl(url)).toBe(true);
  });

  it.each([
    ['http', 'http://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription'],
    ['別ホスト', 'https://evil.example/?Action=ConfirmSubscription'],
    [
      'AWS SNS のホスト名を前方に持つ別ドメイン',
      'https://sns.us-east-1.amazonaws.com.evil.example/',
    ],
    ['パスに AWS SNS のホスト名を含む別ホスト', 'https://evil.example/sns.us-east-1.amazonaws.com'],
    ['リージョンなし', 'https://sns.amazonaws.com/'],
    ['ポート付き', 'https://sns.us-east-1.amazonaws.com:8443/'],
    ['ユーザー情報で別ホストを指す', 'https://sns.us-east-1.amazonaws.com@evil.example/'],
    ['ユーザー情報付き', 'https://user@sns.us-east-1.amazonaws.com/'],
    ['ユーザー名とパスワード付き', 'https://user:pass@sns.us-east-1.amazonaws.com/'],
    ['不正な文字列', 'not a url'],
    ['空文字', ''],
  ])('%s は false を返す', (_label, url) => {
    expect(isSnsSubscribeUrl(url)).toBe(false);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['数値', 12345],
    ['オブジェクト', {}],
  ])('非文字列 (%s) は false を返す', (_label, url) => {
    expect(isSnsSubscribeUrl(url)).toBe(false);
  });
});
