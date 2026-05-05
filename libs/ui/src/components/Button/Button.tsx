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
export type ButtonColor = 'primary' | 'secondary' | 'danger' | 'success' | 'warning' | 'neutral';

/**
 * Button のサイズ。
 */
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Button の共通プロパティ（asChild の有無に依らず使えるもの）。
 */
type ButtonOwnPropsBase = {
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
};

type ButtonHtmlProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'>;

/**
 * 通常モード（`asChild` 未指定または `false`）の Props。
 * `startIcon` を受け付ける。
 */
type ButtonRegularProps = ButtonHtmlProps &
  ButtonOwnPropsBase & {
    asChild?: false;
    /**
     * ボタン左側に表示する装飾アイコン。`aria-hidden="true"` が自動付与される。
     * `loading` 中は内部で非表示になり、スピナーに置き換わる。
     */
    startIcon?: React.ReactNode;
  };

/**
 * `asChild` モードの Props。
 * Radix `Slot` は単一子要素しか許容しないため、`startIcon` の同時指定は型エラーにする。
 */
type ButtonAsChildProps = ButtonHtmlProps &
  ButtonOwnPropsBase & {
    asChild: true;
    /**
     * `asChild` モードでは利用不可。子要素自身で構造を組み立てること。
     */
    startIcon?: never;
  };

/**
 * Button のプロパティ。
 *
 * 100% ライブラリ非依存の独自定義。MUI / Radix 等の Props 型は extends しない。
 * エスケープハッチは `className` のみ（`sx` / `style` は提供しない）。
 */
export type ButtonProps = ButtonRegularProps | ButtonAsChildProps;

/**
 * 汎用ボタンコンポーネント。
 *
 * - `variant` × `color` × `size` の直交した API
 * - `loading` でスピナー表示（`aria-busy` 自動設定）
 * - `startIcon` で左側装飾アイコン（`aria-hidden` 自動付与）
 * - `asChild` でリンク等への変身に対応（Radix Slot パターン、`startIcon` とは排他）
 *
 * @see docs/development/shared-ui-components.md
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(props, ref) {
  const {
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
  } = props;
  // startIcon は asChild と排他のため、通常モード側でのみ取り出す。
  const startIcon = asChild ? undefined : (props as ButtonRegularProps).startIcon;
  // asChild と startIcon は型で排他にしているが、実際の rest からも除外する。
  if ('startIcon' in rest) {
    delete (rest as { startIcon?: unknown }).startIcon;
  }

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
      <span className={loading ? styles.contentHidden : styles.content}>
        {startIcon ? (
          <span className={styles.startIcon} aria-hidden="true" data-testid="button-start-icon">
            {startIcon}
          </span>
        ) : null}
        {children}
      </span>
    </Comp>
  );
});

export default Button;
