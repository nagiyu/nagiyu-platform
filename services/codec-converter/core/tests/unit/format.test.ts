import { formatFileSize, formatDateTime, formatJobId } from '../../src/format';

describe('formatFileSize', () => {
  it('KB単位でフォーマット（1MB未満）', () => {
    expect(formatFileSize(512 * 1024)).toBe('512.0 KB');
    expect(formatFileSize(1023 * 1024)).toBe('1023.0 KB');
  });

  it('MB単位でフォーマット（1MB以上）', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatFileSize(50 * 1024 * 1024)).toBe('50.0 MB');
    expect(formatFileSize(100 * 1024 * 1024)).toBe('100.0 MB');
  });

  it('小数点以下1桁まで表示', () => {
    expect(formatFileSize(1.5 * 1024)).toBe('1.5 KB');
    expect(formatFileSize(2.75 * 1024 * 1024)).toBe('2.8 MB');
  });

  it('0バイト', () => {
    expect(formatFileSize(0)).toBe('0.0 KB');
  });
});

describe('formatDateTime', () => {
  it('Unix timestamp（秒）を日本語ロケールの日時文字列にフォーマット', () => {
    // 2024-01-01 12:00:00 JST
    const timestamp = 1704070800;
    const formatted = formatDateTime(timestamp);

    // ロケールによって表示が異なる可能性があるため、含まれるべき要素をチェック
    expect(formatted).toContain('2024');
    expect(formatted).toContain('01');
    // 時刻はタイムゾーンによって異なるため、00が含まれることを確認
    expect(formatted).toContain('00');
  });

  it('異なるタイムスタンプでフォーマット', () => {
    // 2023-12-31 23:59:59 JST
    const timestamp = 1704034799;
    const formatted = formatDateTime(timestamp);

    expect(formatted).toContain('2023');
    expect(formatted).toContain('12');
    expect(formatted).toContain('31');
    // 秒が59であることを確認
    expect(formatted).toContain('59');
  });
});

describe('formatJobId', () => {
  it('12文字以下の場合はそのまま返す', () => {
    expect(formatJobId('abc123')).toBe('abc123');
    expect(formatJobId('123456789012')).toBe('123456789012');
  });

  it('12文字より長い場合は先頭8文字と末尾4文字で短縮', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(formatJobId(uuid)).toBe('550e8400...0000');
  });

  it('標準的なUUID形式を短縮', () => {
    expect(formatJobId('123456789012345678')).toBe('12345678...5678');
  });

  it('空文字列の場合', () => {
    expect(formatJobId('')).toBe('');
  });
});
