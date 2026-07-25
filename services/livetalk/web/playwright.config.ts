import { config } from 'dotenv';
import { resolve } from 'path';
import { createPlaywrightConfig } from '../../../configs/playwright.config.base';

config({ path: resolve(__dirname, '.env.test') });

export default createPlaywrightConfig({
  webServerUrl: 'http://localhost:3000/api/health',
});
