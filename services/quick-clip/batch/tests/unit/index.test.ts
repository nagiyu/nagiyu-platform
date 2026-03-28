import { createBatchBootstrapMessage } from '../../src/index.js';

describe('quick-clip batch bootstrap', () => {
  it('creates bootstrap message', () => {
    expect(createBatchBootstrapMessage()).toBe('quick-clip-batch bootstrap: ok');
  });
});
