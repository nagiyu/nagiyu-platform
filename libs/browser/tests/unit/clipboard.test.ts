/**
 * Unit tests for clipboard utilities
 */

import { readFromClipboard, writeToClipboard } from '../../src/clipboard';

describe('clipboard', () => {
  describe('readFromClipboard', () => {
    let originalClipboard: Clipboard | undefined;

    beforeEach(() => {
      // Save original clipboard
      originalClipboard = navigator.clipboard;
    });

    afterEach(() => {
      // Restore original clipboard
      if (originalClipboard) {
        Object.defineProperty(navigator, 'clipboard', {
          writable: true,
          value: originalClipboard,
        });
      }
    });

    it('正常系: クリップボードからテキストを正常に読み取れる', async () => {
      // Arrange: Mock navigator.clipboard.readText to return a sample text
      const mockText = 'テストテキスト';
      const mockReadText = jest.fn().mockResolvedValue(mockText);
      Object.defineProperty(global.navigator, 'clipboard', {
        writable: true,
        value: {
          readText: mockReadText,
        },
      });

      // Act: Call readFromClipboard
      const result = await readFromClipboard();

      // Assert: Verify the result and that the API was called
      expect(result).toBe(mockText);
      expect(mockReadText).toHaveBeenCalledTimes(1);
    });

    it('正常系: 空文字列を読み取れる', async () => {
      // Arrange: Mock navigator.clipboard.readText to return empty string
      const mockReadText = jest.fn().mockResolvedValue('');
      Object.defineProperty(global.navigator, 'clipboard', {
        writable: true,
        value: {
          readText: mockReadText,
        },
      });

      // Act: Call readFromClipboard
      const result = await readFromClipboard();

      // Assert: Verify empty string is returned
      expect(result).toBe('');
      expect(mockReadText).toHaveBeenCalledTimes(1);
    });

    it('正常系: 長いテキストを読み取れる', async () => {
      // Arrange: Mock navigator.clipboard.readText to return long text
      const mockText = 'a'.repeat(10000);
      const mockReadText = jest.fn().mockResolvedValue(mockText);
      Object.defineProperty(global.navigator, 'clipboard', {
        writable: true,
        value: {
          readText: mockReadText,
        },
      });

      // Act: Call readFromClipboard
      const result = await readFromClipboard();

      // Assert: Verify long text is returned
      expect(result).toBe(mockText);
      expect(mockReadText).toHaveBeenCalledTimes(1);
    });

    it('異常系: クリップボードの読み取りに失敗した場合、適切なエラーメッセージを投げる', async () => {
      // Arrange: Mock navigator.clipboard.readText to reject
      const mockReadText = jest.fn().mockRejectedValue(new Error('Permission denied'));
      Object.defineProperty(global.navigator, 'clipboard', {
        writable: true,
        value: {
          readText: mockReadText,
        },
      });

      // Act & Assert: Verify error is thrown with correct message
      await expect(readFromClipboard()).rejects.toThrow(
        'クリップボードの読み取りに失敗しました。手動で貼り付けてください。'
      );
      expect(mockReadText).toHaveBeenCalledTimes(1);
    });

    it('異常系: navigator.clipboardが存在しない場合、エラーを投げる', async () => {
      // Arrange: navigator.clipboard is undefined
      Object.defineProperty(global.navigator, 'clipboard', {
        writable: true,
        value: undefined,
      });

      // Act & Assert: Verify error is thrown
      await expect(readFromClipboard()).rejects.toThrow(
        'クリップボードの読み取りに失敗しました。手動で貼り付けてください。'
      );
    });
  });

  describe('writeToClipboard', () => {
    let originalClipboard: Clipboard | undefined;

    beforeEach(() => {
      // Save original clipboard
      originalClipboard = navigator.clipboard;
    });

    afterEach(() => {
      // Restore original clipboard
      if (originalClipboard) {
        Object.defineProperty(navigator, 'clipboard', {
          writable: true,
          value: originalClipboard,
        });
      }
    });

    it('正常系: テキストをクリップボードに正常に書き込める', async () => {
      // Arrange: Mock navigator.clipboard.writeText to resolve successfully
      const mockText = 'テストテキスト';
      const mockWriteText = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(global.navigator, 'clipboard', {
        writable: true,
        value: {
          writeText: mockWriteText,
        },
      });

      // Act: Call writeToClipboard
      await writeToClipboard(mockText);

      // Assert: Verify the API was called with correct text
      expect(mockWriteText).toHaveBeenCalledTimes(1);
      expect(mockWriteText).toHaveBeenCalledWith(mockText);
    });

    it('正常系: 空文字列を書き込める', async () => {
      // Arrange: Mock navigator.clipboard.writeText to resolve successfully
      const mockWriteText = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(global.navigator, 'clipboard', {
        writable: true,
        value: {
          writeText: mockWriteText,
        },
      });

      // Act: Call writeToClipboard with empty string
      await writeToClipboard('');

      // Assert: Verify the API was called with empty string
      expect(mockWriteText).toHaveBeenCalledTimes(1);
      expect(mockWriteText).toHaveBeenCalledWith('');
    });

    it('正常系: 長いテキストを書き込める', async () => {
      // Arrange: Mock navigator.clipboard.writeText to resolve successfully
      const mockText = 'a'.repeat(10000);
      const mockWriteText = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(global.navigator, 'clipboard', {
        writable: true,
        value: {
          writeText: mockWriteText,
        },
      });

      // Act: Call writeToClipboard with long text
      await writeToClipboard(mockText);

      // Assert: Verify the API was called with long text
      expect(mockWriteText).toHaveBeenCalledTimes(1);
      expect(mockWriteText).toHaveBeenCalledWith(mockText);
    });

    it('正常系: 特殊文字を含むテキストを書き込める', async () => {
      // Arrange: Mock navigator.clipboard.writeText to resolve successfully
      const mockText = '改行\nタブ\t特殊文字!@#$%^&*()';
      const mockWriteText = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(global.navigator, 'clipboard', {
        writable: true,
        value: {
          writeText: mockWriteText,
        },
      });

      // Act: Call writeToClipboard with special characters
      await writeToClipboard(mockText);

      // Assert: Verify the API was called with special characters
      expect(mockWriteText).toHaveBeenCalledTimes(1);
      expect(mockWriteText).toHaveBeenCalledWith(mockText);
    });

    it('異常系: クリップボードへの書き込みに失敗した場合、適切なエラーメッセージを投げる', async () => {
      // Arrange: Mock navigator.clipboard.writeText to reject
      const mockWriteText = jest.fn().mockRejectedValue(new Error('Permission denied'));
      Object.defineProperty(global.navigator, 'clipboard', {
        writable: true,
        value: {
          writeText: mockWriteText,
        },
      });

      // Act & Assert: Verify error is thrown with correct message
      await expect(writeToClipboard('test')).rejects.toThrow(
        'クリップボードへの書き込みに失敗しました。'
      );
      expect(mockWriteText).toHaveBeenCalledTimes(1);
    });

    it('異常系: navigator.clipboardが存在しない場合、エラーを投げる', async () => {
      // Arrange: navigator.clipboard is undefined
      Object.defineProperty(global.navigator, 'clipboard', {
        writable: true,
        value: undefined,
      });

      // Act & Assert: Verify error is thrown
      await expect(writeToClipboard('test')).rejects.toThrow(
        'クリップボードへの書き込みに失敗しました。'
      );
    });
  });
});
