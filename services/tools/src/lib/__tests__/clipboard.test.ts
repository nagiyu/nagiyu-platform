import { readFromClipboard, writeToClipboard } from '../clipboard';

describe('clipboard', () => {
  describe('readFromClipboard', () => {
    it('正常系: Clipboard API が呼ばれることを確認', async () => {
      const mockText = 'テストテキスト';
      const mockReadText = jest.fn().mockResolvedValue(mockText);

      Object.assign(navigator, {
        clipboard: {
          readText: mockReadText,
        },
      });

      const result = await readFromClipboard();

      expect(mockReadText).toHaveBeenCalled();
      expect(result).toBe(mockText);
    });

    it('異常系: 権限エラー時に適切なエラーがスローされる', async () => {
      const mockReadText = jest.fn().mockRejectedValue(new Error('Permission denied'));

      Object.assign(navigator, {
        clipboard: {
          readText: mockReadText,
        },
      });

      await expect(readFromClipboard()).rejects.toThrow(
        'クリップボードの読み取りに失敗しました。手動で貼り付けてください。'
      );
    });
  });

  describe('writeToClipboard', () => {
    it('正常系: Clipboard API が呼ばれることを確認', async () => {
      const mockText = 'テストテキスト';
      const mockWriteText = jest.fn().mockResolvedValue(undefined);

      Object.assign(navigator, {
        clipboard: {
          writeText: mockWriteText,
        },
      });

      await writeToClipboard(mockText);

      expect(mockWriteText).toHaveBeenCalledWith(mockText);
    });

    it('異常系: 権限エラー時に適切なエラーがスローされる', async () => {
      const mockWriteText = jest.fn().mockRejectedValue(new Error('Permission denied'));

      Object.assign(navigator, {
        clipboard: {
          writeText: mockWriteText,
        },
      });

      await expect(writeToClipboard('test')).rejects.toThrow(
        'クリップボードへの書き込みに失敗しました。'
      );
    });
  });
});
