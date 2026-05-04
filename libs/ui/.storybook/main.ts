import type { StorybookConfig } from '@storybook/react-vite';

/**
 * Storybook 設定
 *
 * - Vite ビルダーで起動・ビルドを高速化
 * - Stories は src/ 配下のコンポーネント隣接配置を前提とする
 * - addon-themes でライト/ダーク切替、addon-a11y でアクセシビリティチェックを提供
 */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx|mdx)'],
  addons: ['@storybook/addon-themes', '@storybook/addon-a11y'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  typescript: {
    reactDocgen: 'react-docgen-typescript',
  },
};

export default config;
