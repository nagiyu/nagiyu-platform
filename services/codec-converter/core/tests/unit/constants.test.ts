import {
  MAX_FILE_SIZE,
  CONVERSION_TIMEOUT_SECONDS,
  JOB_EXPIRATION_SECONDS,
  ALLOWED_MIME_TYPES,
  ALLOWED_FILE_EXTENSIONS,
  CODEC_FILE_EXTENSIONS,
} from '../../src/constants';

describe('Constants', () => {
  it('MAX_FILE_SIZE は 500MB である', () => {
    expect(MAX_FILE_SIZE).toBe(500 * 1024 * 1024);
  });

  it('CONVERSION_TIMEOUT_SECONDS は 7200秒（2時間）である', () => {
    expect(CONVERSION_TIMEOUT_SECONDS).toBe(7200);
  });

  it('JOB_EXPIRATION_SECONDS は 86400秒（24時間）である', () => {
    expect(JOB_EXPIRATION_SECONDS).toBe(86400);
  });

  it('ALLOWED_MIME_TYPES に video/mp4 が含まれている', () => {
    expect(ALLOWED_MIME_TYPES).toContain('video/mp4');
  });

  it('ALLOWED_FILE_EXTENSIONS に .mp4 が含まれている', () => {
    expect(ALLOWED_FILE_EXTENSIONS).toContain('.mp4');
  });

  it('CODEC_FILE_EXTENSIONS は正しいマッピングを持つ', () => {
    expect(CODEC_FILE_EXTENSIONS.h264).toBe('.mp4');
    expect(CODEC_FILE_EXTENSIONS.vp9).toBe('.webm');
    expect(CODEC_FILE_EXTENSIONS.av1).toBe('.webm');
  });
});
