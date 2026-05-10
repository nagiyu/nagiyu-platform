import { formatDateTime, formatJobId } from '../../src/format';

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
