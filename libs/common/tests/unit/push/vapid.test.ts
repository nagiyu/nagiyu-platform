import { logger } from '../../../src/logger/index.js';
import { normalizeVapidKey } from '../../../src/push/vapid.js';

describe('normalizeVapidKey', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('前後の空白を除去する', () => {
    expect(normalizeVapidKey('  test-key  ', 'publicKey')).toBe('test-key');
  });

  test('引用符で囲まれた値を正規化する', () => {
    expect(normalizeVapidKey('"test-key"', 'publicKey')).toBe('test-key');
  });

  test('JSON文字列から指定キーを抽出する', () => {
    const raw = '{"publicKey":"public-value","privateKey":"private-value"}';
    expect(normalizeVapidKey(raw, 'publicKey')).toBe('public-value');
    expect(normalizeVapidKey(raw, 'privateKey')).toBe('private-value');
  });

  test('エスケープされたJSON文字列から指定キーを抽出する', () => {
    const raw = '"{\\"publicKey\\":\\"public-value\\",\\"privateKey\\":\\"private-value\\"}"';
    expect(normalizeVapidKey(raw, 'publicKey')).toBe('public-value');
    expect(normalizeVapidKey(raw, 'privateKey')).toBe('private-value');
  });

  test('JSONに指定キーが無い場合は警告して元の文字列を返す', () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation();
    const raw = '{"privateKey":"private-value"}';

    const result = normalizeVapidKey(raw, 'publicKey');

    expect(result).toBe(raw);
    expect(warnSpy).toHaveBeenCalledWith('VAPID キーJSONに必要なキーが見つかりませんでした', {
      keyName: 'publicKey',
      expectedFormat: '{ "publicKey": "...", "privateKey": "..." }',
    });
  });

  test('JSON解析に失敗した場合は警告して引用符除去後の値を返す', () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation();

    const result = normalizeVapidKey('"{\\"publicKey\\":invalid}"', 'publicKey');

    expect(result).toBe('{\\"publicKey\\":invalid}');
    expect(warnSpy).toHaveBeenCalledWith(
      'VAPID キーのJSON解析に失敗しました。プレーン文字列として処理します',
      expect.objectContaining({
        error: expect.any(String),
      })
    );
  });
});
