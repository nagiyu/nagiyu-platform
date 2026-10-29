import { formatJobId } from '../../src/format';

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
