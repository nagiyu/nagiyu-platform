import { createHash } from 'node:crypto';
import { createSubscriptionId } from '../../../src/push-subscription/subscription-id.js';

describe('createSubscriptionId', () => {
  test('同じ endpoint では同じ ID になる', async () => {
    const endpoint = 'https://push.example.com/abc';
    expect(await createSubscriptionId(endpoint)).toBe(await createSubscriptionId(endpoint));
  });

  test('endpoint が異なれば ID も異なる', async () => {
    expect(await createSubscriptionId('https://push.example.com/a')).not.toBe(
      await createSubscriptionId('https://push.example.com/b')
    );
  });

  test('既存サービスの購読 ID と互換な値になる (node:crypto の SHA-256 と一致)', async () => {
    const endpoint = 'https://fcm.googleapis.com/fcm/send/テスト?x=1';
    const hex = createHash('sha256').update(endpoint, 'utf8').digest('hex');
    expect(await createSubscriptionId(endpoint)).toBe(`sub_${hex.substring(0, 32)}`);
  });

  test('固定値の回帰テスト', async () => {
    expect(await createSubscriptionId('https://example.com')).toBe(
      'sub_100680ad546ce6a577f42f52df33b4cf'
    );
  });

  test('sub_ + 32 文字 hex の形式になる', async () => {
    expect(await createSubscriptionId('https://example.com/x')).toMatch(/^sub_[0-9a-f]{32}$/);
  });
});
