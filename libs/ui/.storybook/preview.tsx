import type { Preview } from '@storybook/react-vite';
import { withThemeByDataAttribute } from '@storybook/addon-themes';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import * as React from 'react';

import theme from '../src/styles/theme';

import '../src/styles/tokens.css';

/**
 * Storybook グローバル設定
 *
 * - tokens.css をグローバル import し、CSS 変数を全 Story で利用可能にする
 * - MUI の ThemeProvider で既存の MUI コンポーネントをサポート
 * - data-theme 属性によるライト/ダーク切替を Storybook ツールバーから制御
 */
const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    layout: 'centered',
    backgrounds: {
      disable: true,
    },
  },
  decorators: [
    /**
     * data-theme 属性をルート要素に適用してテーマ切替を実現する。
     * 現状 light のみ。dark は tokens.css 側で値定義済みのため、トグルで切替確認が可能。
     */
    withThemeByDataAttribute({
      themes: {
        light: 'light',
        dark: 'dark',
      },
      defaultTheme: 'light',
      attributeName: 'data-theme',
    }),
    (Story) => (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Story />
      </ThemeProvider>
    ),
  ],
};

export default preview;
