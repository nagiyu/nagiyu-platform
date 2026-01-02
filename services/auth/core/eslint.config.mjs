import { defineConfig } from 'eslint/config';
import baseConfig from '../../../configs/eslint.config.base.mjs';

const eslintConfig = defineConfig([...baseConfig]);

export default eslintConfig;
