/**
 * generateEventId の単体テスト
 */

import { generateEventId } from '../../../src/error-event/event-id.js';

describe('generateEventId', () => {
  it('文字列を返す', () => {
    const id = generateEventId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('呼び出すたびに異なる ID を返す', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateEventId());
    }
    expect(ids.size).toBe(100);
  });
});
