/**
 * @nagiyu/ui デザイントークン（TypeScript 参照ヘルパー）
 *
 * CSS 変数（tokens.css）への参照を型付きで提供する。
 * コンポーネントは本オブジェクトを通じてトークンを参照すること。
 *
 * 例:
 *   import { tokens } from '@nagiyu/ui/styles/tokens';
 *   const style = { color: tokens.color.action.primary };
 *   // → { color: 'var(--color-action-primary)' }
 *
 * 詳細: docs/development/shared-ui-components.md
 */

export const tokens = {
  color: {
    bg: {
      canvas: 'var(--color-bg-canvas)',
      surface: 'var(--color-bg-surface)',
      subtle: 'var(--color-bg-subtle)',
    },
    fg: {
      default: 'var(--color-fg-default)',
      muted: 'var(--color-fg-muted)',
      disabled: 'var(--color-fg-disabled)',
      onAccent: 'var(--color-fg-on-accent)',
    },
    border: {
      default: 'var(--color-border-default)',
      subtle: 'var(--color-border-subtle)',
      strong: 'var(--color-border-strong)',
    },
    action: {
      primary: {
        default: 'var(--color-action-primary)',
        hover: 'var(--color-action-primary-hover)',
        active: 'var(--color-action-primary-active)',
        subtle: 'var(--color-action-primary-subtle)',
        fg: 'var(--color-action-primary-fg)',
      },
      secondary: {
        default: 'var(--color-action-secondary)',
        hover: 'var(--color-action-secondary-hover)',
        active: 'var(--color-action-secondary-active)',
        subtle: 'var(--color-action-secondary-subtle)',
        fg: 'var(--color-action-secondary-fg)',
      },
      danger: {
        default: 'var(--color-action-danger)',
        hover: 'var(--color-action-danger-hover)',
        active: 'var(--color-action-danger-active)',
        subtle: 'var(--color-action-danger-subtle)',
        fg: 'var(--color-action-danger-fg)',
      },
      warning: {
        default: 'var(--color-action-warning)',
        hover: 'var(--color-action-warning-hover)',
        active: 'var(--color-action-warning-active)',
        subtle: 'var(--color-action-warning-subtle)',
        fg: 'var(--color-action-warning-fg)',
      },
      success: {
        default: 'var(--color-action-success)',
        hover: 'var(--color-action-success-hover)',
        active: 'var(--color-action-success-active)',
        subtle: 'var(--color-action-success-subtle)',
        fg: 'var(--color-action-success-fg)',
      },
      info: {
        default: 'var(--color-action-info)',
        hover: 'var(--color-action-info-hover)',
        active: 'var(--color-action-info-active)',
        subtle: 'var(--color-action-info-subtle)',
        fg: 'var(--color-action-info-fg)',
      },
    },
  },
  spacing: {
    xs: 'var(--spacing-xs)',
    sm: 'var(--spacing-sm)',
    md: 'var(--spacing-md)',
    lg: 'var(--spacing-lg)',
    xl: 'var(--spacing-xl)',
    '2xl': 'var(--spacing-2xl)',
  },
  fontFamily: {
    sans: 'var(--font-family-sans)',
    mono: 'var(--font-family-mono)',
  },
  fontSize: {
    xs: 'var(--font-size-xs)',
    sm: 'var(--font-size-sm)',
    md: 'var(--font-size-md)',
    lg: 'var(--font-size-lg)',
    xl: 'var(--font-size-xl)',
  },
  fontWeight: {
    regular: 'var(--font-weight-regular)',
    medium: 'var(--font-weight-medium)',
    bold: 'var(--font-weight-bold)',
  },
  lineHeight: {
    tight: 'var(--line-height-tight)',
    normal: 'var(--line-height-normal)',
    loose: 'var(--line-height-loose)',
  },
  radius: {
    none: 'var(--radius-none)',
    sm: 'var(--radius-sm)',
    md: 'var(--radius-md)',
    lg: 'var(--radius-lg)',
    full: 'var(--radius-full)',
  },
  shadow: {
    sm: 'var(--shadow-sm)',
    md: 'var(--shadow-md)',
    lg: 'var(--shadow-lg)',
    xl: 'var(--shadow-xl)',
  },
  zIndex: {
    dropdown: 'var(--z-dropdown)',
    sticky: 'var(--z-sticky)',
    modal: 'var(--z-modal)',
    toast: 'var(--z-toast)',
    tooltip: 'var(--z-tooltip)',
  },
  duration: {
    fast: 'var(--duration-fast)',
    normal: 'var(--duration-normal)',
    slow: 'var(--duration-slow)',
  },
  easing: {
    linear: 'var(--easing-linear)',
    in: 'var(--easing-in)',
    out: 'var(--easing-out)',
    inOut: 'var(--easing-in-out)',
  },
} as const;

/**
 * Breakpoint 値（数値、メディアクエリ等で使用）
 *
 * CSS 変数ではなく、JS / TS から直接参照する用途のため数値で提供する。
 * MUI Theme 等で `breakpoints.values` に渡す前提。
 */
export const breakpoints = {
  xs: 0,
  sm: 600,
  md: 900,
  lg: 1200,
  xl: 1536,
} as const;

/**
 * テーマモード
 *
 * `<html data-theme="...">` で指定する値。
 */
export type ThemeMode = 'light' | 'dark';

/**
 * セマンティックな色ロール
 *
 * コンポーネントの `color` Prop の値として用いる。
 */
export type ColorRole =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'warning'
  | 'success'
  | 'info'
  | 'neutral';

/**
 * セマンティックなサイズ
 */
export type Size = 'sm' | 'md' | 'lg';
