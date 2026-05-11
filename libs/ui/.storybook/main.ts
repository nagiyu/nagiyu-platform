import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';

/**
 * Storybook 設定
 *
 * - Vite ビルダーで起動・ビルドを高速化
 * - Stories は src/ 配下のコンポーネント隣接配置を前提とする
 * - addon-themes でライト/ダーク切替、addon-a11y でアクセシビリティチェックを提供
 *
 * NOTE: `libs/ui/tsconfig.json` は Next.js 互換のため `jsx: 'preserve'` にして
 * いる。Storybook（Vite）でビルドする際は React 17+ の自動 JSX ランタイムを
 * 使うよう viteFinal で esbuild を明示設定し、`React.createElement` への
 * 変換を回避する（`Can't find variable: React` エラー対策）。
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
  async viteFinal(config) {
    return mergeConfig(config, {
      esbuild: {
        jsx: 'automatic',
        jsxImportSource: 'react',
      },
    });
  },
};

export default config;
