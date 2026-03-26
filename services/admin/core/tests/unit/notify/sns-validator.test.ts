import { describe, it, expect, beforeEach } from '@jest/globals';
import { validateSnsMessage, type SnsMessage } from '../../../src/notify/sns-validator.js';

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
