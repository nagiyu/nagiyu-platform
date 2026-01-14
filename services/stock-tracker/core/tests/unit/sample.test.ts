/**
 * Sample Test
 *
 * ビルドとテスト環境が正しく動作することを確認するためのサンプルテスト
 */

describe('Stock Tracker Core Package', () => {
  describe('Basic functionality', () => {
    it('should perform simple calculations', () => {
      // 基本的な計算が正しく動作することを確認
      const sum = (a: number, b: number): number => a + b;
      expect(sum(1, 2)).toBe(3);
      expect(sum(-1, 1)).toBe(0);
      expect(sum(0, 0)).toBe(0);
    });

    it('should handle strings', () => {
      // 文字列処理が正しく動作することを確認
      const concat = (a: string, b: string): string => a + b;
      expect(concat('Hello', 'World')).toBe('HelloWorld');
      expect(concat('', 'test')).toBe('test');
    });

    it('should perform array operations', () => {
      // 配列操作が正しく動作することを確認
      const numbers = [1, 2, 3, 4, 5];
      expect(numbers.length).toBe(5);
      expect(numbers.filter((n) => n > 3)).toEqual([4, 5]);
      expect(numbers.reduce((sum, n) => sum + n, 0)).toBe(15);
    });
  });

  describe('Type validation', () => {
    it('should validate number types', () => {
      // 数値型のバリデーション
      const isPositive = (n: number): boolean => n > 0;
      expect(isPositive(1)).toBe(true);
      expect(isPositive(0)).toBe(false);
      expect(isPositive(-1)).toBe(false);
    });

    it('should validate string types', () => {
      // 文字列型のバリデーション
      const isEmpty = (s: string): boolean => s.length === 0;
      expect(isEmpty('')).toBe(true);
      expect(isEmpty('test')).toBe(false);
    });

    it('should validate object types', () => {
      // オブジェクト型のバリデーション
      type User = {
        id: string;
        name: string;
      };
      const user: User = { id: '1', name: 'Test User' };
      expect(user.id).toBe('1');
      expect(user.name).toBe('Test User');
    });
  });

  describe('Error handling', () => {
    it('should throw errors', () => {
      // エラーが正しくスローされることを確認
      const throwError = (): never => {
        throw new Error('テストエラー');
      };
      expect(() => throwError()).toThrow('テストエラー');
    });

    it('should handle undefined values', () => {
      // undefined の処理が正しく動作することを確認
      const getValue = (value?: string): string => value || 'デフォルト';
      expect(getValue('テスト')).toBe('テスト');
      expect(getValue(undefined)).toBe('デフォルト');
      expect(getValue()).toBe('デフォルト');
    });
  });
});
