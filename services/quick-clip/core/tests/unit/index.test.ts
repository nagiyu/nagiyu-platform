import { getQuickClipCoreHealth } from '../../src/index.js';

describe('quick-clip core bootstrap', () => {
  it('returns healthy status', () => {
    expect(getQuickClipCoreHealth()).toEqual({ status: 'ok' });
  });
});
