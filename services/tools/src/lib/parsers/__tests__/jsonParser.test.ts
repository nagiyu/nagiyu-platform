import { parseJson, validateJson, ERROR_MESSAGES } from '../jsonParser';

describe('jsonParser', () => {
  describe('validateJson', () => {
    it('正常系: 正しいフォーマットのJSONは検証を通過する - オブジェクト', () => {
      const input = '{"name":"太郎","age":30}';
      const result = validateJson(input);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('正常系: 正しいフォーマットのJSONは検証を通過する - 配列', () => {
      const input = '[1,2,3,4,5]';
      const result = validateJson(input);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('正常系: 正しいフォーマットのJSONは検証を通過する - ネストされたオブジェクト', () => {
      const input = '{"user":{"name":"太郎","address":{"city":"東京"}}}';
      const result = validateJson(input);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('正常系: 文字列値もJSONとして有効', () => {
      const input = '"hello world"';
      const result = validateJson(input);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('正常系: 数値もJSONとして有効', () => {
      const input = '123';
      const result = validateJson(input);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('正常系: null もJSONとして有効', () => {
      const input = 'null';
      const result = validateJson(input);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('正常系: true もJSONとして有効', () => {
      const input = 'true';
      const result = validateJson(input);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('正常系: false もJSONとして有効', () => {
      const input = 'false';
      const result = validateJson(input);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('異常系: 空文字列でエラーになる', () => {
      const result = validateJson('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe(ERROR_MESSAGES.EMPTY_INPUT);
    });

    it('異常系: スペースのみの文字列でエラーになる', () => {
      const result = validateJson('   ');
      expect(result.valid).toBe(false);
      expect(result.error).toBe(ERROR_MESSAGES.EMPTY_INPUT);
    });

    it('異常系: 不正なJSON形式でエラーになる - カンマミス', () => {
      const input = '{"name":"太郎",}';
      const result = validateJson(input);
      expect(result.valid).toBe(false);
      expect(result.error).toBe(ERROR_MESSAGES.INVALID_JSON);
    });

    it('異常系: 不正なJSON形式でエラーになる - クォートミス', () => {
      const input = '{name:"太郎"}';
      const result = validateJson(input);
      expect(result.valid).toBe(false);
      expect(result.error).toBe(ERROR_MESSAGES.INVALID_JSON);
    });

    it('異常系: 不正なJSON形式でエラーになる - 括弧が閉じていない', () => {
      const input = '{"name":"太郎"';
      const result = validateJson(input);
      expect(result.valid).toBe(false);
      expect(result.error).toBe(ERROR_MESSAGES.INVALID_JSON);
    });

    it('異常系: プレーンテキストはJSONとして無効', () => {
      const input = 'hello world';
      const result = validateJson(input);
      expect(result.valid).toBe(false);
      expect(result.error).toBe(ERROR_MESSAGES.INVALID_JSON);
    });
  });

  describe('parseJson', () => {
    it('正常系: オブジェクトをパースして整形できる', () => {
      const input = '{"name":"太郎","age":30}';
      const result = parseJson(input);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.formatted).toBe('{\n  "name": "太郎",\n  "age": 30\n}');
    });

    it('正常系: 配列をパースして整形できる', () => {
      const input = '[1,2,3,4,5]';
      const result = parseJson(input);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.formatted).toBe('[\n  1,\n  2,\n  3,\n  4,\n  5\n]');
    });

    it('正常系: ネストされたオブジェクトをパースして整形できる', () => {
      const input = '{"user":{"name":"太郎","address":{"city":"東京"}}}';
      const result = parseJson(input);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.formatted).toContain('"user"');
      expect(result.formatted).toContain('"name": "太郎"');
      expect(result.formatted).toContain('"city": "東京"');
      // インデントが2スペースであることを確認
      expect(result.formatted).toMatch(/ {2}"/);
    });

    it('正常系: 既に整形されたJSONも再パースできる', () => {
      const input = `{
  "name": "太郎",
  "age": 30
}`;
      const result = parseJson(input);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.formatted).toBe('{\n  "name": "太郎",\n  "age": 30\n}');
    });

    it('正常系: 文字列値もパース可能', () => {
      const input = '"hello world"';
      const result = parseJson(input);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.formatted).toBe('"hello world"');
    });

    it('正常系: 数値もパース可能', () => {
      const input = '123';
      const result = parseJson(input);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.formatted).toBe('123');
    });

    it('正常系: nullもパース可能', () => {
      const input = 'null';
      const result = parseJson(input);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.formatted).toBe('null');
    });

    it('正常系: true もパース可能', () => {
      const input = 'true';
      const result = parseJson(input);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.formatted).toBe('true');
    });

    it('正常系: false もパース可能', () => {
      const input = 'false';
      const result = parseJson(input);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.formatted).toBe('false');
    });

    it('正常系: 空配列もパース可能', () => {
      const input = '[]';
      const result = parseJson(input);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.formatted).toBe('[]');
    });

    it('正常系: 空オブジェクトもパース可能', () => {
      const input = '{}';
      const result = parseJson(input);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.formatted).toBe('{}');
    });

    it('正常系: 複雑なJSONもパースできる', () => {
      const input =
        '{"users":[{"id":1,"name":"太郎","tags":["admin","user"]},{"id":2,"name":"花子","tags":["user"]}]}';
      const result = parseJson(input);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.formatted).toContain('"users"');
      expect(result.formatted).toContain('"id": 1');
      expect(result.formatted).toContain('"name": "太郎"');
      expect(result.formatted).toContain('"tags"');
      // インデントが2スペースであることを確認
      expect(result.formatted).toMatch(/ {2}"/);
    });

    it('正常系: Unicode文字を含むJSONもパースできる', () => {
      const input = '{"message":"こんにちは世界🌍","emoji":"😀"}';
      const result = parseJson(input);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.formatted).toContain('こんにちは世界🌍');
      expect(result.formatted).toContain('😀');
    });

    it('異常系: 空文字列でエラーになる', () => {
      const result = parseJson('');

      expect(result.isValid).toBe(false);
      expect(result.error).toBe(ERROR_MESSAGES.EMPTY_INPUT);
      expect(result.formatted).toBe('');
    });

    it('異常系: スペースのみの文字列でエラーになる', () => {
      const result = parseJson('   ');

      expect(result.isValid).toBe(false);
      expect(result.error).toBe(ERROR_MESSAGES.EMPTY_INPUT);
      expect(result.formatted).toBe('');
    });

    it('異常系: 不正なJSON形式でエラーになる - カンマミス', () => {
      const input = '{"name":"太郎",}';
      const result = parseJson(input);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe(ERROR_MESSAGES.INVALID_JSON);
      expect(result.formatted).toBe('');
    });

    it('異常系: 不正なJSON形式でエラーになる - クォートミス', () => {
      const input = '{name:"太郎"}';
      const result = parseJson(input);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe(ERROR_MESSAGES.INVALID_JSON);
      expect(result.formatted).toBe('');
    });

    it('異常系: 不正なJSON形式でエラーになる - 括弧が閉じていない', () => {
      const input = '{"name":"太郎"';
      const result = parseJson(input);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe(ERROR_MESSAGES.INVALID_JSON);
      expect(result.formatted).toBe('');
    });

    it('異常系: プレーンテキストではエラーになる', () => {
      const input = 'hello world';
      const result = parseJson(input);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe(ERROR_MESSAGES.INVALID_JSON);
      expect(result.formatted).toBe('');
    });
  });
});
