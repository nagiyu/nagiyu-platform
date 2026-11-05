import { getClientIp, VIEWER_IP_HEADER_NAME } from '@/lib/server/client-ip';

describe('getClientIp', () => {
  it('専用ヘッダーの値を返す。IPv4 はそのまま返す', () => {
    expect(getClientIp(new Headers({ [VIEWER_IP_HEADER_NAME]: '203.0.113.7' }))).toBe(
      '203.0.113.7'
    );
    expect(getClientIp(new Headers({ [VIEWER_IP_HEADER_NAME]: ' 203.0.113.8 ' }))).toBe(
      '203.0.113.8'
    );
  });

  it.each([
    ['2001:db8:1:2:aaaa:bbbb:cccc:dddd', '2001:0db8:0001:0002::/64'],
    ['2001:DB8:1:2::1', '2001:0db8:0001:0002::/64'],
    ['2001:db8::1', '2001:0db8:0000:0000::/64'],
    ['::1', '0000:0000:0000:0000::/64'],
    ['2001:db8:1:2:3:4:5:6%eth0', '2001:0db8:0001:0002::/64'],
  ])('IPv6 %s は先頭 64 ビットにまとめる', (ip, expected) => {
    expect(getClientIp(new Headers({ [VIEWER_IP_HEADER_NAME]: ip }))).toBe(expected);
  });

  it('同じ /64 の別の末尾は同じキーになり、別の /64 は別のキーになる', () => {
    const key = (ip: string): string | undefined =>
      getClientIp(new Headers({ [VIEWER_IP_HEADER_NAME]: ip }));

    expect(key('2001:db8:1:2::1')).toBe(key('2001:db8:1:2:ffff:ffff:ffff:ffff'));
    expect(key('2001:db8:1:2::1')).not.toBe(key('2001:db8:1:3::1'));
  });

  it('IPv4 マップ表記は IPv4 として扱う。壊れた IPv6 はそのまま返す', () => {
    expect(getClientIp(new Headers({ [VIEWER_IP_HEADER_NAME]: '::ffff:203.0.113.7' }))).toBe(
      '203.0.113.7'
    );
    expect(getClientIp(new Headers({ [VIEWER_IP_HEADER_NAME]: '2001:db8:1' }))).toBe('2001:db8:1');
  });

  it('X-Forwarded-For と CloudFront-Viewer-Address は読まない', () => {
    expect(
      getClientIp(
        new Headers({
          'x-forwarded-for': '198.51.100.1',
          'cloudfront-viewer-address': '203.0.113.7:1',
        })
      )
    ).toBeUndefined();
  });

  it('専用ヘッダーが無い、または空なら undefined', () => {
    expect(getClientIp(new Headers())).toBeUndefined();
    expect(getClientIp(new Headers({ [VIEWER_IP_HEADER_NAME]: '  ' }))).toBeUndefined();
  });
});
