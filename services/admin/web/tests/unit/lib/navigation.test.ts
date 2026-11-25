import { getOrigin } from '@/lib/navigation';

describe('getOrigin', () => {
  it('現在のブラウザの origin を返す', () => {
    expect(getOrigin()).toBe(window.location.origin);
  });
});
