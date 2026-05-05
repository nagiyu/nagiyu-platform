'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';

import styles from './Button.module.css';

/**
 * Button のバリアント。
 *
 * - `solid`: 塗りつぶし（強調アクション）
 * - `outline`: 枠線のみ（中位アクション）
 * - `ghost`: 背景なし（弱い・補助アクション）
 */
export type ButtonVariant = 'solid' | 'outline' | 'ghost';

/**
 * Button の色（意味）。視覚的な色名（blue 等）ではなく必ず意味で指定する。
 */
export type ButtonColor =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'success'
  | 'warning'
  | 'neutral';

/**
 * Button のサイズ。
 */
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Button のプロパティ。
 *
 * 100% ライブラリ非依存の独自定義。MUI / Radix 等の Props 型は extends しない。
 * エスケープハッチは `className` のみ（`sx` / `style` は提供しない）。
 */
export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  /**
   * バリアント。既定: `solid`
   */
  variant?: ButtonVariant;
  /**
   * 色（意味）。既定: `primary`
   */
  color?: ButtonColor;
  /**
   * サイズ。既定: `md`
   */
  size?: ButtonSize;
  /**
   * ローディング中はスピナーを表示し、操作を抑止する。
   */
  loading?: boolean;
  /**
   * `true` の場合、Radix Slot により子要素に Props をマージする。
   * 子要素は単一の React 要素である必要がある（`<a>` / `<Link>` 等）。
   */
  asChild?: boolean;
}

/**
 * 汎用ボタンコンポーネント。
 *
 * - `variant` × `color` × `size` の直交した API
 * - `loading` でスピナー表示（`aria-busy` 自動設定）
 * - `asChild` でリンク等への変身に対応（Radix Slot パターン）
 *
 * @see docs/development/shared-ui-components.md
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'solid',
    color = 'primary',
    size = 'md',
    loading = false,
    asChild = false,
    disabled,
    className,
    children,
    type,
    'aria-busy': ariaBusy,
    'aria-disabled': ariaDisabled,
    ...rest
  },
  ref,
) {
  const Comp: React.ElementType = asChild ? Slot : 'button';
  const isDisabled = disabled || loading;

  const classes = [
    styles.button,
    styles[`variant-${variant}`],
    styles[`color-${color}`],
    styles[`size-${size}`],
    loading ? styles.loading : null,
    isDisabled ? styles.disabled : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  // asChild の場合、子要素は <button> とは限らないため `disabled` 属性は付与しない。
  // 代わりに `aria-disabled` と CSS で操作抑止する。
  const buttonProps = asChild
    ? {
        'aria-disabled': ariaDisabled ?? (isDisabled || undefined),
        'aria-busy': ariaBusy ?? (loading || undefined),
      }
    : {
        type: type ?? 'button',
        disabled: isDisabled,
        'aria-busy': ariaBusy ?? (loading || undefined),
        'aria-disabled': ariaDisabled,
      };

  // asChild の場合、Radix Slot は単一の React 要素しか受け付けないため、
  // 子要素をそのまま渡す。スピナー描画は通常モードに限定し、asChild + loading は
  // `aria-busy` と `[aria-disabled]` 経由の視覚的減光（opacity）で表現する。
  if (asChild) {
    return (
      <Comp ref={ref} className={classes} {...buttonProps} {...rest}>
        {children}
      </Comp>
    );
  }

  return (
    <Comp ref={ref} className={classes} {...buttonProps} {...rest}>
      {loading ? (
        <span className={styles.spinner} aria-hidden="true" data-testid="button-spinner" />
      ) : null}
      <span className={loading ? styles.contentHidden : styles.content}>{children}</span>
    </Comp>
  );
});

export default Button;
