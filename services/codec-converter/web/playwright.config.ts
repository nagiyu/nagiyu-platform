import { createPlaywrightConfig } from '../../../configs/playwright.config.base';

export default createPlaywrightConfig({
  testDir: './tests/integration',
  workspace: '@nagiyu/codec-converter-web',
  webServerCwd: '../../..',
  webServerTimeout: 3 * 60 * 1000,
});
