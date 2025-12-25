/**
 * Unit tests for localStorage utilities
 */

import { getItem, setItem, removeItem } from '../../src/localStorage';

describe('localStorage', () => {
  // Store original localStorage
  let originalLocalStorage: Storage;

  beforeAll(() => {
    // Save the original localStorage
    originalLocalStorage = window.localStorage;
  });

  beforeEach(() => {
    // Clear localStorage before each test
    window.localStorage.clear();
    jest.clearAllMocks();
  });

  afterAll(() => {
    // Restore original localStorage
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
  });

  describe('getItem', () => {
    it('正常系: 文字列値を正常に読み取れる', () => {
      // Arrange
      window.localStorage.setItem('testKey', 'testValue');

      // Act
      const result = getItem<string>('testKey');

      // Assert
      expect(result).toBe('testValue');
    });

    it('正常系: JSON形式のオブジェクトを正常にパースして読み取れる', () => {
      // Arrange
      const testObject = { name: 'テスト', value: 123 };
      window.localStorage.setItem('testKey', JSON.stringify(testObject));

      // Act
      const result = getItem<{ name: string; value: number }>('testKey');

      // Assert
      expect(result).toEqual(testObject);
    });

    it('正常系: JSON形式の配列を正常にパースして読み取れる', () => {
      // Arrange
      const testArray = ['item1', 'item2', 'item3'];
      window.localStorage.setItem('testKey', JSON.stringify(testArray));

      // Act
      const result = getItem<string[]>('testKey');

      // Assert
      expect(result).toEqual(testArray);
    });

    it('正常系: JSON形式のnullを正常に読み取れる', () => {
      // Arrange
      window.localStorage.setItem('testKey', 'null');

      // Act
      const result = getItem('testKey');

      // Assert
      expect(result).toBe(null);
    });

    it('正常系: 存在しないキーの場合はnullを返す', () => {
      // Act
      const result = getItem('nonExistentKey');

      // Assert
      expect(result).toBe(null);
    });

    it('正常系: JSON形式でない文字列の場合はそのまま返す', () => {
      // Arrange
      window.localStorage.setItem('testKey', 'not-a-json');

      // Act
      const result = getItem<string>('testKey');

      // Assert
      expect(result).toBe('not-a-json');
    });

    it('SSR対応: windowが存在しない場合はnullを返す', () => {
      // Arrange: Remove window object temporarily
      const originalWindow = globalThis.window;
      // @ts-expect-error - Deleting window for SSR test
      delete globalThis.window;

      // Act
      const result = getItem('testKey');

      // Assert
      expect(result).toBe(null);

      // Restore
      globalThis.window = originalWindow;
    });

    it('SSR対応: window.localStorageが存在しない場合はnullを返す', () => {
      // Arrange: Remove localStorage temporarily
      const originalLocalStorage = window.localStorage;
      Object.defineProperty(window, 'localStorage', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      // Act
      const result = getItem('testKey');

      // Assert
      expect(result).toBe(null);

      // Restore
      Object.defineProperty(window, 'localStorage', {
        value: originalLocalStorage,
        writable: true,
        configurable: true,
      });
    });

    it('異常系: localStorage.getItemでエラーが発生した場合はnullを返す', () => {
      // Arrange: Mock getItem to throw error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('Storage access denied');
      });

      // Act
      const result = getItem('testKey');

      // Assert
      expect(result).toBe(null);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[localStorage] Failed to get item "testKey":',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
      jest.restoreAllMocks();
    });
  });

  describe('setItem', () => {
    it('正常系: 文字列値を正常に書き込める', () => {
      // Act
      setItem('testKey', 'testValue');

      // Assert
      expect(window.localStorage.getItem('testKey')).toBe('testValue');
    });

    it('正常系: オブジェクトをJSON形式で書き込める', () => {
      // Arrange
      const testObject = { name: 'テスト', value: 123 };

      // Act
      setItem('testKey', testObject);

      // Assert
      expect(window.localStorage.getItem('testKey')).toBe(JSON.stringify(testObject));
    });

    it('正常系: 配列をJSON形式で書き込める', () => {
      // Arrange
      const testArray = ['item1', 'item2', 'item3'];

      // Act
      setItem('testKey', testArray);

      // Assert
      expect(window.localStorage.getItem('testKey')).toBe(JSON.stringify(testArray));
    });

    it('正常系: 数値を書き込める', () => {
      // Act
      setItem('testKey', 123);

      // Assert
      expect(window.localStorage.getItem('testKey')).toBe('123');
    });

    it('正常系: booleanを書き込める', () => {
      // Act
      setItem('testKey', true);

      // Assert
      expect(window.localStorage.getItem('testKey')).toBe('true');
    });

    it('正常系: nullを書き込める', () => {
      // Act
      setItem('testKey', null);

      // Assert
      expect(window.localStorage.getItem('testKey')).toBe('null');
    });

    it('正常系: 空文字列を書き込める', () => {
      // Act
      setItem('testKey', '');

      // Assert
      expect(window.localStorage.getItem('testKey')).toBe('');
    });

    it('SSR対応: windowが存在しない場合は警告を出して何もしない', () => {
      // Arrange
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const originalWindow = globalThis.window;
      const originalLocalStorage = window.localStorage;

      // Simulate SSR by making window.localStorage undefined
      Object.defineProperty(window, 'localStorage', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      // Act
      setItem('testKey', 'testValue');

      // Assert
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[localStorage] localStorage is not available (SSR or private mode)'
      );

      consoleWarnSpy.mockRestore();
      // Restore
      Object.defineProperty(window, 'localStorage', {
        value: originalLocalStorage,
        writable: true,
        configurable: true,
      });
      globalThis.window = originalWindow;
    });

    it('SSR対応: window.localStorageが存在しない場合は警告を出して何もしない', () => {
      // Arrange
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const originalLocalStorage = window.localStorage;
      Object.defineProperty(window, 'localStorage', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      // Act
      setItem('testKey', 'testValue');

      // Assert
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[localStorage] localStorage is not available (SSR or private mode)'
      );

      consoleWarnSpy.mockRestore();
      // Restore
      Object.defineProperty(window, 'localStorage', {
        value: originalLocalStorage,
        writable: true,
        configurable: true,
      });
    });

    it('異常系: クォータ超過エラー(QuotaExceededError)の場合は日本語エラーメッセージを投げる', () => {
      // Arrange
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const quotaError = new DOMException('QuotaExceededError', 'QuotaExceededError');
      jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw quotaError;
      });

      // Act & Assert
      expect(() => setItem('testKey', 'testValue')).toThrow(
        'ストレージの容量が不足しています。不要なデータを削除してください。'
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[localStorage] Storage quota exceeded for key "testKey"'
      );

      consoleErrorSpy.mockRestore();
      jest.restoreAllMocks();
    });

    it('異常系: クォータ超過エラー(NS_ERROR_DOM_QUOTA_REACHED)の場合は日本語エラーメッセージを投げる', () => {
      // Arrange
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const quotaError = new DOMException(
        'NS_ERROR_DOM_QUOTA_REACHED',
        'NS_ERROR_DOM_QUOTA_REACHED'
      );
      jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw quotaError;
      });

      // Act & Assert
      expect(() => setItem('testKey', 'testValue')).toThrow(
        'ストレージの容量が不足しています。不要なデータを削除してください。'
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[localStorage] Storage quota exceeded for key "testKey"'
      );

      consoleErrorSpy.mockRestore();
      jest.restoreAllMocks();
    });

    it('異常系: クォータ超過エラー(code=22)の場合は日本語エラーメッセージを投げる', () => {
      // Arrange
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      // Create a custom error that mimics DOMException with code 22
      const quotaError: any = new Error('Quota exceeded');
      quotaError.name = 'QuotaExceededError';
      quotaError.code = 22;
      // Make it instanceof DOMException for the check
      Object.setPrototypeOf(quotaError, DOMException.prototype);

      jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw quotaError;
      });

      // Act & Assert
      expect(() => setItem('testKey', 'testValue')).toThrow(
        'ストレージの容量が不足しています。不要なデータを削除してください。'
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[localStorage] Storage quota exceeded for key "testKey"'
      );

      consoleErrorSpy.mockRestore();
      jest.restoreAllMocks();
    });

    it('異常系: その他のエラーの場合は汎用エラーメッセージを投げる', () => {
      // Arrange
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Unknown error');
      });

      // Act & Assert
      expect(() => setItem('testKey', 'testValue')).toThrow('データの保存に失敗しました。');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[localStorage] Failed to set item "testKey":',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
      jest.restoreAllMocks();
    });
  });

  describe('removeItem', () => {
    it('正常系: アイテムを正常に削除できる', () => {
      // Arrange
      window.localStorage.setItem('testKey', 'testValue');

      // Act
      removeItem('testKey');

      // Assert
      expect(window.localStorage.getItem('testKey')).toBe(null);
    });

    it('正常系: 存在しないキーを削除しようとしてもエラーにならない', () => {
      // Act & Assert - should not throw
      expect(() => removeItem('nonExistentKey')).not.toThrow();
    });

    it('SSR対応: windowが存在しない場合は警告を出して何もしない', () => {
      // Arrange
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const originalWindow = globalThis.window;
      const originalLocalStorage = window.localStorage;

      // Simulate SSR by making window.localStorage undefined
      Object.defineProperty(window, 'localStorage', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      // Act
      removeItem('testKey');

      // Assert
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[localStorage] localStorage is not available (SSR or private mode)'
      );

      consoleWarnSpy.mockRestore();
      // Restore
      Object.defineProperty(window, 'localStorage', {
        value: originalLocalStorage,
        writable: true,
        configurable: true,
      });
      globalThis.window = originalWindow;
    });

    it('SSR対応: window.localStorageが存在しない場合は警告を出して何もしない', () => {
      // Arrange
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const originalLocalStorage = window.localStorage;
      Object.defineProperty(window, 'localStorage', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      // Act
      removeItem('testKey');

      // Assert
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[localStorage] localStorage is not available (SSR or private mode)'
      );

      consoleWarnSpy.mockRestore();
      // Restore
      Object.defineProperty(window, 'localStorage', {
        value: originalLocalStorage,
        writable: true,
        configurable: true,
      });
    });

    it('異常系: localStorage.removeItemでエラーが発生した場合はエラーを投げる', () => {
      // Arrange
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('Storage access denied');
      });

      // Act & Assert
      expect(() => removeItem('testKey')).toThrow('データの削除に失敗しました。');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[localStorage] Failed to remove item "testKey":',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
      jest.restoreAllMocks();
    });
  });
});
