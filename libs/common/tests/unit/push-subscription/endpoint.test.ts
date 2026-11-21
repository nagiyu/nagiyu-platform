import { checkPushEndpoint } from '../../../src/push-subscription/endpoint';

describe('checkPushEndpoint', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/abc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
    'https://fcm.googleapis.com:443/fcm/send/abc',
  ])('許可: %s', (endpoint) => {
    expect(checkPushEndpoint(endpoint).allowed).toBe(true);
  });

  it('大文字のホストは小文字化して比較する', () => {
    expect(checkPushEndpoint('https://FCM.GoogleAPIs.com/x')).toEqual({
      allowed: true,
      hostname: 'fcm.googleapis.com',
    });
  });

  it.each(['invalid', ''])('URL 不正: %s', (endpoint) => {
    expect(checkPushEndpoint(endpoint)).toEqual({ allowed: false, reason: 'INVALID_URL' });
  });

  it.each(['javascript:alert(1)', 'ftp://fcm.googleapis.com/x', 'http://fcm.googleapis.com/x'])(
    'https でない: %s',
    (endpoint) => {
      expect(checkPushEndpoint(endpoint)).toEqual({ allowed: false, reason: 'NOT_HTTPS' });
    }
  );

  it('ホスト部を持つ javascript:// 形式も https でないとして拒否する', () => {
    expect(checkPushEndpoint('javascript://fcm.googleapis.com/%0aalert(1)')).toEqual({
      allowed: false,
      reason: 'NOT_HTTPS',
    });
  });

  it('443 以外のポート指定は拒否する', () => {
    expect(checkPushEndpoint('https://fcm.googleapis.com:8443/x')).toEqual({
      allowed: false,
      reason: 'PORT_SPECIFIED',
    });
  });

  it.each([
    ['https://example.com/x', 'example.com'],
    ['https://127.0.0.1/x', '127.0.0.1'],
    ['https://localhost/x', 'localhost'],
    ['https://notify.windows.com/x', 'notify.windows.com'],
    ['https://evilnotify.windows.com/x', 'evilnotify.windows.com'],
    ['https://fcm.googleapis.com.evil.com/x', 'fcm.googleapis.com.evil.com'],
    ['https://user@evil.com/x', 'evil.com'],
  ])('ホストが一覧にない: %s', (endpoint, hostname) => {
    expect(checkPushEndpoint(endpoint)).toEqual({
      allowed: false,
      reason: 'HOST_NOT_ALLOWED',
      hostname,
    });
  });
});
