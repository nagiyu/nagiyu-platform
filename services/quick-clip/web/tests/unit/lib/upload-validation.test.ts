import {
  MAX_FILE_SIZE_BYTES,
  UPLOAD_VALIDATION_ERROR_MESSAGES,
  isValidFileSize,
  isValidMp4File,
  validateUploadFile,
} from '@/lib/upload-validation';

describe('upload-validation', () => {
  describe('isValidMp4File', () => {
    it('拡張子が .mp4 で Content-Type が未指定なら有効', () => {
      expect(isValidMp4File('movie.mp4')).toBe(true);
    });

    it('拡張子の大文字小文字と前後の空白を無視する', () => {
      expect(isValidMp4File('  MOVIE.MP4  ', 'video/mp4')).toBe(true);
    });

    it('拡張子が .mp4 でなければ無効', () => {
      expect(isValidMp4File('movie.mov')).toBe(false);
      expect(isValidMp4File('movie')).toBe(false);
    });

    it('Content-Type が video/mp4 以外なら無効', () => {
      expect(isValidMp4File('movie.mp4', 'video/quicktime')).toBe(false);
      expect(isValidMp4File('movie.mp4', '')).toBe(false);
    });
  });

  describe('isValidFileSize', () => {
    it('0 より大きく上限以下なら有効', () => {
      expect(isValidFileSize(1)).toBe(true);
      expect(isValidFileSize(MAX_FILE_SIZE_BYTES)).toBe(true);
    });

    it('0 以下・上限超過・非有限値は無効', () => {
      expect(isValidFileSize(0)).toBe(false);
      expect(isValidFileSize(-1)).toBe(false);
      expect(isValidFileSize(MAX_FILE_SIZE_BYTES + 1)).toBe(false);
      expect(isValidFileSize(Number.NaN)).toBe(false);
      expect(isValidFileSize(Number.POSITIVE_INFINITY)).toBe(false);
    });

    it('上限は 20 GB', () => {
      expect(MAX_FILE_SIZE_BYTES).toBe(20 * 1024 * 1024 * 1024);
    });
  });

  describe('validateUploadFile', () => {
    it('正しいファイルなら null を返す', () => {
      expect(validateUploadFile({ name: 'a.mp4', size: 10, type: 'video/mp4' })).toBeNull();
    });

    it('ブラウザが MIME を判別できず type が空でも拡張子が正しければ null を返す', () => {
      expect(validateUploadFile({ name: 'a.mp4', size: 10, type: '' })).toBeNull();
    });

    it('形式が不正なら形式のエラーメッセージを返す', () => {
      expect(validateUploadFile({ name: 'a.mov', size: 10, type: 'video/quicktime' })).toBe(
        UPLOAD_VALIDATION_ERROR_MESSAGES.INVALID_FILE_TYPE
      );
    });

    it('サイズが不正ならサイズのエラーメッセージを返す', () => {
      expect(validateUploadFile({ name: 'a.mp4', size: 0, type: 'video/mp4' })).toBe(
        UPLOAD_VALIDATION_ERROR_MESSAGES.INVALID_FILE_SIZE
      );
      expect(
        validateUploadFile({ name: 'a.mp4', size: MAX_FILE_SIZE_BYTES + 1, type: 'video/mp4' })
      ).toBe(UPLOAD_VALIDATION_ERROR_MESSAGES.INVALID_FILE_SIZE);
    });

    it('形式とサイズが両方不正なら形式を優先する', () => {
      expect(validateUploadFile({ name: 'a.mov', size: 0 })).toBe(
        UPLOAD_VALIDATION_ERROR_MESSAGES.INVALID_FILE_TYPE
      );
    });
  });
});
