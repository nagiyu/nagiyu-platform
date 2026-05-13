import { DEFAULT_NOTIFICATION_ICON } from '../../../src/push/constants.js';

describe('DEFAULT_NOTIFICATION_ICON', () => {
  test('デフォルトアイコンパスが正しい', () => {
    expect(DEFAULT_NOTIFICATION_ICON).toBe('/icon-192x192.png');
  });
});
