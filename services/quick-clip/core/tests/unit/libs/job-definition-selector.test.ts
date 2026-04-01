import { selectJobDefinition } from '../../../src/libs/job-definition-selector.js';

describe('selectJobDefinition', () => {
  it('1GB未満はsmallを返す', () => {
    expect(selectJobDefinition(1024 * 1024 * 1024 - 1)).toBe('small');
  });

  it('1GB以上はlargeを返す', () => {
    expect(selectJobDefinition(1024 * 1024 * 1024)).toBe('large');
    expect(selectJobDefinition(2 * 1024 * 1024 * 1024)).toBe('large');
  });
});
