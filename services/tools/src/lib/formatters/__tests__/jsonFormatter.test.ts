import { formatJson, minifyJson, ERROR_MESSAGES } from '../jsonFormatter';

describe('jsonFormatter', () => {
  describe('formatJson', () => {
    describe('正常系: オブジェクト', () => {
      it('シンプルなオブジェクトを整形できる', () => {
        const input = '{"name":"太郎","age":30}';
        const result = formatJson(input);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.formatted).toBe('{\n  "name": "太郎",\n  "age": 30\n}');
      });

      it('ネストしたオブジェクトを整形できる', () => {
        const input = '{"user":{"name":"太郎","address":{"city":"東京","country":"日本"}}}';
        const result = formatJson(input);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.formatted).toContain('"user"');
        expect(result.formatted).toContain('"name": "太郎"');
        expect(result.formatted).toContain('"city": "東京"');
        expect(result.formatted).toContain('"country": "日本"');
        // インデントが2スペースであることを確認
        expect(result.formatted).toMatch(/^ {2}"/m);
        expect(result.formatted).toMatch(/^ {4}"/m);
      });

      it('空オブジェクトを整形できる', () => {
        const input = '{}';
        const result = formatJson(input);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.formatted).toBe('{}');
      });
    });

    describe('正常系: 配列', () => {
      it('数値配列を整形できる', () => {
        const input = '[1,2,3,4,5]';
        const result = formatJson(input);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.formatted).toBe('[\n  1,\n  2,\n  3,\n  4,\n  5\n]');
      });

      it('オブジェクト配列を整形できる', () => {
        const input = '[{"id":1,"name":"太郎"},{"id":2,"name":"花子"}]';
        const result = formatJson(input);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.formatted).toContain('"id": 1');
        expect(result.formatted).toContain('"name": "太郎"');
        expect(result.formatted).toContain('"id": 2');
        expect(result.formatted).toContain('"name": "花子"');
      });

      it('空配列を整形できる', () => {
        const input = '[]';
        const result = formatJson(input);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.formatted).toBe('[]');
      });
    });

    describe('正常系: 複合構造', () => {
      it('ネストした配列を含むオブジェクトを整形できる', () => {
        const input = '{"users":[{"id":1,"tags":["admin","user"]},{"id":2,"tags":["user"]}]}';
        const result = formatJson(input);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.formatted).toContain('"users"');
        expect(result.formatted).toContain('"id": 1');
        expect(result.formatted).toContain('"tags"');
        expect(result.formatted).toContain('"admin"');
        // インデントが2スペースであることを確認
        expect(result.formatted).toMatch(/^ {2}"/m);
      });

      it('深くネストした構造を整形できる', () => {
        const input = '{"level1":{"level2":{"level3":{"level4":"deep"}}}}';
        const result = formatJson(input);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.formatted).toContain('"level1"');
        expect(result.formatted).toContain('"level2"');
        expect(result.formatted).toContain('"level3"');
        expect(result.formatted).toContain('"level4": "deep"');
        // 各レベルのインデントを確認
        expect(result.formatted).toMatch(/^ {2}"/m);
        expect(result.formatted).toMatch(/^ {4}"/m);
        expect(result.formatted).toMatch(/^ {6}"/m);
        expect(result.formatted).toMatch(/^ {8}"/m);
      });

      it('混合データ型を含むJSONを整形できる', () => {
        const input =
          '{"string":"hello","number":123,"boolean":true,"null":null,"array":[1,2,3],"object":{"key":"value"}}';
        const result = formatJson(input);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.formatted).toContain('"string": "hello"');
        expect(result.formatted).toContain('"number": 123');
        expect(result.formatted).toContain('"boolean": true');
        expect(result.formatted).toContain('"null": null');
        expect(result.formatted).toContain('"array"');
        expect(result.formatted).toContain('"object"');
      });
    });

    describe('正常系: プリミティブ値', () => {
      it('文字列値を整形できる', () => {
        const input = '"hello world"';
        const result = formatJson(input);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.formatted).toBe('"hello world"');
      });

      it('数値を整形できる', () => {
        const input = '123';
        const result = formatJson(input);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.formatted).toBe('123');
      });

      it('真偽値 true を整形できる', () => {
        const input = 'true';
        const result = formatJson(input);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.formatted).toBe('true');
      });

      it('真偽値 false を整形できる', () => {
        const input = 'false';
        const result = formatJson(input);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.formatted).toBe('false');
      });

      it('null を整形できる', () => {
        const input = 'null';
        const result = formatJson(input);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.formatted).toBe('null');
      });
    });

    describe('正常系: 特殊文字', () => {
      it('Unicode文字を含むJSONを整形できる', () => {
        const input = '{"message":"こんにちは世界🌍","emoji":"😀"}';
        const result = formatJson(input);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.formatted).toContain('こんにちは世界🌍');
        expect(result.formatted).toContain('😀');
      });

      it('エスケープシーケンスを含むJSONを整形できる', () => {
        const input = '{"text":"line1\\nline2\\ttab"}';
        const result = formatJson(input);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.formatted).toContain('line1\\nline2\\ttab');
      });
    });

    describe('正常系: 既に整形されたJSON', () => {
      it('既に整形されたJSONを再整形できる', () => {
        const input = `{
  "name": "太郎",
  "age": 30
}`;
        const result = formatJson(input);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.formatted).toBe('{\n  "name": "太郎",\n  "age": 30\n}');
      });
    });

    describe('異常系: 空入力', () => {
      it('空文字列でエラーになる', () => {
        const result = formatJson('');

        expect(result.isValid).toBe(false);
        expect(result.error).toBe(ERROR_MESSAGES.EMPTY_INPUT);
        expect(result.formatted).toBe('');
      });

      it('スペースのみの文字列でエラーになる', () => {
        const result = formatJson('   ');

        expect(result.isValid).toBe(false);
        expect(result.error).toBe(ERROR_MESSAGES.EMPTY_INPUT);
        expect(result.formatted).toBe('');
      });

      it('タブと改行のみの文字列でエラーになる', () => {
        const result = formatJson('\t\n  \n');

        expect(result.isValid).toBe(false);
        expect(result.error).toBe(ERROR_MESSAGES.EMPTY_INPUT);
        expect(result.formatted).toBe('');
      });
    });

    describe('異常系: 不正なJSON', () => {
      it('末尾のカンマでエラーになる', () => {
        const input = '{"name":"太郎",}';
        const result = formatJson(input);

        expect(result.isValid).toBe(false);
        expect(result.error).toBe(ERROR_MESSAGES.INVALID_JSON);
        expect(result.formatted).toBe('');
      });

      it('キーにクォートがない場合エラーになる', () => {
        const input = '{name:"太郎"}';
        const result = formatJson(input);

        expect(result.isValid).toBe(false);
        expect(result.error).toBe(ERROR_MESSAGES.INVALID_JSON);
        expect(result.formatted).toBe('');
      });

      it('括弧が閉じていない場合エラーになる', () => {
        const input = '{"name":"太郎"';
        const result = formatJson(input);

        expect(result.isValid).toBe(false);
        expect(result.error).toBe(ERROR_MESSAGES.INVALID_JSON);
        expect(result.formatted).toBe('');
      });

      it('プレーンテキストでエラーになる', () => {
        const input = 'hello world';
        const result = formatJson(input);

        expect(result.isValid).toBe(false);
        expect(result.error).toBe(ERROR_MESSAGES.INVALID_JSON);
        expect(result.formatted).toBe('');
      });

      it('シングルクォートでエラーになる', () => {
        const input = "{'name':'太郎'}";
        const result = formatJson(input);

        expect(result.isValid).toBe(false);
        expect(result.error).toBe(ERROR_MESSAGES.INVALID_JSON);
        expect(result.formatted).toBe('');
      });
    });
  });

  describe('minifyJson', () => {
    describe('正常系: オブジェクト', () => {
      it('オブジェクトを圧縮できる', () => {
        const input = '{\n  "name": "太郎",\n  "age": 30\n}';
        const result = minifyJson(input);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.formatted).toBe('{"name":"太郎","age":30}');
        // 空白が含まれないことを確認（文字列値の中は除く）
        expect(
          result.formatted
            .split('"')
            .filter((_, i) => i % 2 === 0)
            .join('')
        ).not.toContain(' ');
        expect(result.formatted).not.toContain('\n');
      });

      it('ネストしたオブジェクトを圧縮できる', () => {
        const input = `{
  "user": {
    "name": "太郎",
    "address": {
      "city": "東京"
    }
  }
}`;
        const result = minifyJson(input);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.formatted).toBe('{"user":{"name":"太郎","address":{"city":"東京"}}}');
        expect(result.formatted).not.toContain('\n');
        expect(result.formatted).not.toContain('  ');
      });
    });

    describe('正常系: 配列', () => {
      it('配列を圧縮できる', () => {
        const input = '[\n  1,\n  2,\n  3\n]';
        const result = minifyJson(input);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.formatted).toBe('[1,2,3]');
        expect(result.formatted).not.toContain('\n');
        expect(result.formatted).not.toContain(' ');
      });

      it('オブジェクト配列を圧縮できる', () => {
        const input = `[
  {
    "id": 1,
    "name": "太郎"
  },
  {
    "id": 2,
    "name": "花子"
  }
]`;
        const result = minifyJson(input);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.formatted).toBe('[{"id":1,"name":"太郎"},{"id":2,"name":"花子"}]');
        expect(result.formatted).not.toContain('\n');
      });
    });

    describe('正常系: 複合構造', () => {
      it('複雑な構造を圧縮できる', () => {
        const input = `{
  "users": [
    {
      "id": 1,
      "tags": ["admin", "user"]
    }
  ]
}`;
        const result = minifyJson(input);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.formatted).toBe('{"users":[{"id":1,"tags":["admin","user"]}]}');
        expect(result.formatted).not.toContain('\n');
      });
    });

    describe('正常系: プリミティブ値', () => {
      it('文字列を圧縮できる', () => {
        const input = '"hello world"';
        const result = minifyJson(input);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.formatted).toBe('"hello world"');
      });

      it('数値を圧縮できる', () => {
        const input = '123';
        const result = minifyJson(input);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.formatted).toBe('123');
      });

      it('真偽値を圧縮できる', () => {
        const input = 'true';
        const result = minifyJson(input);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.formatted).toBe('true');
      });

      it('null を圧縮できる', () => {
        const input = 'null';
        const result = minifyJson(input);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.formatted).toBe('null');
      });
    });

    describe('正常系: 既に圧縮されたJSON', () => {
      it('既に圧縮されたJSONを再圧縮できる', () => {
        const input = '{"name":"太郎","age":30}';
        const result = minifyJson(input);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.formatted).toBe('{"name":"太郎","age":30}');
      });
    });

    describe('正常系: 空白を含むJSON', () => {
      it('複数の空白を削除できる', () => {
        const input = '{ "name"  :  "太郎" , "age"  :  30 }';
        const result = minifyJson(input);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.formatted).toBe('{"name":"太郎","age":30}');
      });
    });

    describe('異常系: 空入力', () => {
      it('空文字列でエラーになる', () => {
        const result = minifyJson('');

        expect(result.isValid).toBe(false);
        expect(result.error).toBe(ERROR_MESSAGES.EMPTY_INPUT);
        expect(result.formatted).toBe('');
      });

      it('スペースのみの文字列でエラーになる', () => {
        const result = minifyJson('   ');

        expect(result.isValid).toBe(false);
        expect(result.error).toBe(ERROR_MESSAGES.EMPTY_INPUT);
        expect(result.formatted).toBe('');
      });
    });

    describe('異常系: 不正なJSON', () => {
      it('末尾のカンマでエラーになる', () => {
        const input = '{"name":"太郎",}';
        const result = minifyJson(input);

        expect(result.isValid).toBe(false);
        expect(result.error).toBe(ERROR_MESSAGES.INVALID_JSON);
        expect(result.formatted).toBe('');
      });

      it('キーにクォートがない場合エラーになる', () => {
        const input = '{name:"太郎"}';
        const result = minifyJson(input);

        expect(result.isValid).toBe(false);
        expect(result.error).toBe(ERROR_MESSAGES.INVALID_JSON);
        expect(result.formatted).toBe('');
      });

      it('括弧が閉じていない場合エラーになる', () => {
        const input = '{"name":"太郎"';
        const result = minifyJson(input);

        expect(result.isValid).toBe(false);
        expect(result.error).toBe(ERROR_MESSAGES.INVALID_JSON);
        expect(result.formatted).toBe('');
      });

      it('プレーンテキストでエラーになる', () => {
        const input = 'hello world';
        const result = minifyJson(input);

        expect(result.isValid).toBe(false);
        expect(result.error).toBe(ERROR_MESSAGES.INVALID_JSON);
        expect(result.formatted).toBe('');
      });
    });
  });

  describe('formatJson と minifyJson の相互変換', () => {
    it('整形 → 圧縮 → 整形の結果が一致する', () => {
      const input = '{"name":"太郎","age":30,"city":"東京"}';

      const formatted = formatJson(input);
      expect(formatted.isValid).toBe(true);

      const minified = minifyJson(formatted.formatted);
      expect(minified.isValid).toBe(true);
      expect(minified.formatted).toBe(input);

      const reformatted = formatJson(minified.formatted);
      expect(reformatted.isValid).toBe(true);
      expect(reformatted.formatted).toBe(formatted.formatted);
    });

    it('圧縮 → 整形 → 圧縮の結果が一致する', () => {
      const input = `{
  "name": "太郎",
  "age": 30
}`;

      const minified = minifyJson(input);
      expect(minified.isValid).toBe(true);

      const formatted = formatJson(minified.formatted);
      expect(formatted.isValid).toBe(true);

      const reminified = minifyJson(formatted.formatted);
      expect(reminified.isValid).toBe(true);
      expect(reminified.formatted).toBe(minified.formatted);
    });
  });
});
