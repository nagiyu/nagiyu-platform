import { MAX_FILE_SIZE } from '../src/constants.js';
import {
  validateFileSize,
  validateMimeType,
  validateFileExtension,
  validateFile,
} from '../src/validation.js';

describe('validateFileSize', () => {
  it('有効なファイルサイズの場合はバリデーション成功', () => {
    const result = validateFileSize(100 * 1024 * 1024); // 100MB
    expect(result.isValid).toBe(true);
    expect(result.errorMessage).toBeUndefined();
  });

  it('ファイルサイズが0の場合はバリデーション失敗', () => {
    const result = validateFileSize(0);
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('ファイルサイズが不正です');
  });

  it('ファイルサイズが負の場合はバリデーション失敗', () => {
    const result = validateFileSize(-1);
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('ファイルサイズが不正です');
  });

  it('ファイルサイズが上限を超える場合はバリデーション失敗', () => {
    const result = validateFileSize(MAX_FILE_SIZE + 1);
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('ファイルサイズは500MB以下である必要があります');
  });

  it('ファイルサイズが上限ちょうどの場合はバリデーション成功', () => {
    const result = validateFileSize(MAX_FILE_SIZE);
    expect(result.isValid).toBe(true);
    expect(result.errorMessage).toBeUndefined();
  });
});

describe('validateMimeType', () => {
  it('video/mp4の場合はバリデーション成功', () => {
    const result = validateMimeType('video/mp4');
    expect(result.isValid).toBe(true);
    expect(result.errorMessage).toBeUndefined();
  });

  it('video/webmの場合はバリデーション失敗', () => {
    const result = validateMimeType('video/webm');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('MP4ファイルのみアップロード可能です');
  });

  it('text/plainの場合はバリデーション失敗', () => {
    const result = validateMimeType('text/plain');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('MP4ファイルのみアップロード可能です');
  });

  it('空文字の場合はバリデーション失敗', () => {
    const result = validateMimeType('');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('MP4ファイルのみアップロード可能です');
  });
});

describe('validateFileExtension', () => {
  it('.mp4の場合はバリデーション成功', () => {
    const result = validateFileExtension('video.mp4');
    expect(result.isValid).toBe(true);
    expect(result.errorMessage).toBeUndefined();
  });

  it('.MP4（大文字）の場合はバリデーション成功', () => {
    const result = validateFileExtension('video.MP4');
    expect(result.isValid).toBe(true);
    expect(result.errorMessage).toBeUndefined();
  });

  it('.Mp4（混在）の場合はバリデーション成功', () => {
    const result = validateFileExtension('video.Mp4');
    expect(result.isValid).toBe(true);
    expect(result.errorMessage).toBeUndefined();
  });

  it('.webmの場合はバリデーション失敗', () => {
    const result = validateFileExtension('video.webm');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('MP4ファイルのみアップロード可能です');
  });

  it('.txtの場合はバリデーション失敗', () => {
    const result = validateFileExtension('document.txt');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('MP4ファイルのみアップロード可能です');
  });

  it('拡張子なしの場合はバリデーション失敗', () => {
    const result = validateFileExtension('video');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('MP4ファイルのみアップロード可能です');
  });
});

describe('validateFile', () => {
  it('すべて有効な場合はバリデーション成功', () => {
    const result = validateFile('video.mp4', 100 * 1024 * 1024, 'video/mp4');
    expect(result.isValid).toBe(true);
    expect(result.errorMessage).toBeUndefined();
  });

  it('ファイル拡張子が無効な場合はバリデーション失敗', () => {
    const result = validateFile('video.webm', 100 * 1024 * 1024, 'video/mp4');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('MP4ファイルのみアップロード可能です');
  });

  it('MIMEタイプが無効な場合はバリデーション失敗', () => {
    const result = validateFile('video.mp4', 100 * 1024 * 1024, 'video/webm');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('MP4ファイルのみアップロード可能です');
  });

  it('ファイルサイズが無効な場合はバリデーション失敗', () => {
    const result = validateFile('video.mp4', MAX_FILE_SIZE + 1, 'video/mp4');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('ファイルサイズは500MB以下である必要があります');
  });

  it('複数の条件が無効な場合は最初のエラーを返す（拡張子優先）', () => {
    const result = validateFile('video.webm', MAX_FILE_SIZE + 1, 'video/webm');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('MP4ファイルのみアップロード可能です');
  });
});
