/**
 * Basic test to ensure the package is set up correctly
 */
import * as reactPackage from '../src/index';

describe('@nagiyu/react', () => {
  it('should export the package correctly', () => {
    expect(reactPackage).toBeDefined();
  });
});
