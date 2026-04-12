import { SERVICE_URLS, SERVICE_NAMES } from '@/lib/services';

describe('services', () => {
  describe('SERVICE_URLS', () => {
    it('tools の URL が正しい', () => {
      expect(SERVICE_URLS['tools']).toBe('https://tools.nagiyu.com');
    });

    it('quick-clip の URL が正しい', () => {
      expect(SERVICE_URLS['quick-clip']).toBe('https://quick-clip.nagiyu.com');
    });

    it('codec-converter の URL が正しい', () => {
      expect(SERVICE_URLS['codec-converter']).toBe('https://codec-converter.nagiyu.com');
    });

    it('stock-tracker の URL が正しい', () => {
      expect(SERVICE_URLS['stock-tracker']).toBe('https://stock-tracker.nagiyu.com');
    });

    it('niconico-mylist-assistant の URL が正しい', () => {
      expect(SERVICE_URLS['niconico-mylist-assistant']).toBe(
        'https://niconico-mylist-assistant.nagiyu.com'
      );
    });

    it('share-together の URL が正しい', () => {
      expect(SERVICE_URLS['share-together']).toBe('https://share-together.nagiyu.com');
    });

    it('auth の URL が正しい', () => {
      expect(SERVICE_URLS['auth']).toBe('https://auth.nagiyu.com');
    });

    it('admin の URL が正しい', () => {
      expect(SERVICE_URLS['admin']).toBe('https://admin.nagiyu.com');
    });

    it('8 サービスすべて定義されている', () => {
      expect(Object.keys(SERVICE_URLS)).toHaveLength(8);
    });
  });

  describe('SERVICE_NAMES', () => {
    it('tools の表示名が正しい', () => {
      expect(SERVICE_NAMES['tools']).toBe('Tools');
    });

    it('quick-clip の表示名が正しい', () => {
      expect(SERVICE_NAMES['quick-clip']).toBe('Quick Clip');
    });

    it('8 サービスすべて定義されている', () => {
      expect(Object.keys(SERVICE_NAMES)).toHaveLength(8);
    });
  });
});
