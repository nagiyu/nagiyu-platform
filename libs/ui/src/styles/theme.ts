import { createTheme } from '@mui/material/styles';

import { breakpoints } from './tokens';

/**
 * MUI Theme
 *
 * デザイントークン（`tokens.css`）と同じ Primitive 値を palette に直接展開する。
 *
 * NOTE: MUI 内部の `alpha()` / `decomposeColor()` は CSS 変数（`var(--...)`）
 * を色として解釈できないため、palette には具体的な色値（#xxxxxx 等）を
 * 与える必要がある。値は `tokens.css` の light テーマに対応する Primitive
 * を反映している。
 *
 * 一方、サイズ・余白・角丸・影・トランジション等の非カラー値は CSS 変数を
 * そのまま参照する（MUI 内部での色解析が走らないため）。
 *
 * 共通 UI コンポーネント（Phase 1 以降の `Button` 等）は MUI Theme に依存せず、
 * 直接 `tokens.css` の CSS 変数を参照することで、ライト/ダーク・サービス別
 * アクセント等のテーマ切替に追従する。
 *
 * 詳細: docs/development/shared-ui-components.md
 */
const theme = createTheme({
  palette: {
    primary: {
      main: '#1565c0',
      light: '#42a5f5',
      dark: '#0d47a1',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#424242',
      light: '#757575',
      dark: '#1b1b1b',
      contrastText: '#ffffff',
    },
    error: {
      main: '#d32f2f',
      light: '#ef5350',
      dark: '#b71c1c',
      contrastText: '#ffffff',
    },
    warning: {
      main: '#ed6c02',
      light: '#ff9800',
      dark: '#e65100',
      contrastText: '#ffffff',
    },
    info: {
      main: '#0288d1',
      light: '#03a9f4',
      dark: '#01579b',
      contrastText: '#ffffff',
    },
    success: {
      main: '#2e7d32',
      light: '#4caf50',
      dark: '#1b5e20',
      contrastText: '#ffffff',
    },
    background: {
      default: '#fafafa',
      paper: '#ffffff',
    },
    text: {
      primary: 'rgba(0, 0, 0, 0.87)',
      secondary: 'rgba(0, 0, 0, 0.6)',
      disabled: 'rgba(0, 0, 0, 0.38)',
    },
    divider: '#e0e0e0',
  },
  typography: {
    fontFamily: 'var(--font-family-sans)',
    h1: {
      fontSize: '2.5rem', // 40px
      fontWeight: 500,
      lineHeight: 1.2,
    },
    h2: {
      fontSize: '2rem', // 32px
      fontWeight: 500,
      lineHeight: 1.3,
    },
    h3: {
      fontSize: '1.75rem', // 28px
      fontWeight: 500,
      lineHeight: 1.4,
    },
    h4: {
      fontSize: '1.5rem', // 24px
      fontWeight: 500,
      lineHeight: 1.4,
    },
    h5: {
      fontSize: '1.25rem', // 20px
      fontWeight: 500,
      lineHeight: 1.5,
    },
    h6: {
      fontSize: '1rem', // 16px
      fontWeight: 500,
      lineHeight: 1.6,
    },
    body1: {
      fontSize: '1rem', // 16px
      fontWeight: 400,
      lineHeight: 1.5,
    },
    body2: {
      fontSize: '0.875rem', // 14px
      fontWeight: 400,
      lineHeight: 1.43,
    },
    button: {
      fontSize: '0.875rem', // 14px
      fontWeight: 500,
      textTransform: 'none', // ボタンテキストを大文字にしない
    },
    caption: {
      fontSize: '0.75rem', // 12px
      fontWeight: 400,
      lineHeight: 1.66,
    },
  },
  breakpoints: {
    values: breakpoints,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 'var(--radius-md)',
          padding: '8px 16px',
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'var(--shadow-sm)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
          transition:
            'box-shadow var(--duration-slow) var(--easing-in-out)',
          '&:hover': {
            boxShadow: 'var(--shadow-lg)',
          },
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
      },
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 'var(--radius-md)',
          },
        },
      },
    },
  },
});

export default theme;
