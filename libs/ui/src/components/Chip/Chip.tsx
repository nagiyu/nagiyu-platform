'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';

import styles from './Chip.module.css';

/**
 * Chip のバリアント。
 *
 * - `solid`: 塗りつぶし（既定。タグ・ステータス表示）
 * - `outline`: 枠線のみ（弱めの強調）
 */
export type ChipVariant = 'solid' | 'outline';

/**
 * Chip の色（意味）。Button と同じセマンティック軸。
 */
export type ChipColor = 'primary' | 'secondary' | 'danger' | 'success' | 'warning' | 'neutral';

/**
 * Chip のサイズ。
 */
export type ChipSize = 'sm' | 'md' | 'lg';

/**
 * Chip のプロパティ。
 *
 * 100% ライブラリ非依存の独自定義。MUI / Radix 等の Props 型は extends しない。
 * エスケープハッチは `className` のみ。
 */
export interface ChipProps extends Omit<React.HTMLAttributes<HTMLElement>, 'color'> {
  /**
   * バリアント。既定: `solid`
   */
  variant?: ChipVariant;
  /**
   * 色（意味）。既定: `neutral`
   */
  color?: ChipColor;
  /**
   * サイズ。既定: `md`
   */
  size?: ChipSize;
  /**
   * `true` の場合、Radix Slot により子要素に Props をマージする。
   * 子要素は単一の React 要素である必要がある（`<a>` / `<Link>` 等）。
   *
   * `onClick` ではなく `<a href>` でナビゲーションしたい場合や、Next.js の
   * `<Link>` を Chip 風に表示したい場合に使う。
   */
  asChild?: boolean;
  /**
   * 子要素（ラベル文字列、または `asChild` 時は単一要素）。
   */
  children: React.ReactNode;
}

/**
 * タグ・ステータス表示用の小型部品。
 *
 * - `variant` × `color` × `size` の直交した API
 * - `onClick` を渡すと `<button>` として描画され、キーボード操作にも対応
 * - `asChild` で `<Link>` / `<a>` 等への変身に対応（Radix Slot パターン）
 *
 * @see docs/development/shared-ui-components.md
 */
const Chip = React.forwardRef<HTMLElement, ChipProps>(function Chip(
  {
    variant = 'solid',
    color = 'neutral',
    size = 'md',
    asChild = false,
    onClick,
    className,
    children,
    ...rest
  },
  ref
) {
  // 描画される要素を決定する:
  // - asChild: Radix Slot で子要素に props をマージ
  // - onClick あり: <button type="button">（キーボード操作・a11y 自動対応）
  // - その他: <span>（静的なタグ表示）
  const Comp: React.ElementType = asChild ? Slot : onClick ? 'button' : 'span';

  const classes = [
    styles.chip,
    styles[`variant-${variant}`],
    styles[`color-${color}`],
    styles[`size-${size}`],
    onClick || asChild ? styles.interactive : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  // <button> で描画する場合は type="button" を付けてフォーム送信を防ぐ。
  const buttonOnlyProps = !asChild && onClick ? { type: 'button' as const } : {};

  // Comp は span / button / Slot のいずれかになり、ref の型推論が要素ごとに揺れる。
  // 実態としては HTMLElement のサブタイプを指すため、`as never` でアサーションを通す。
  return (
    <Comp ref={ref as never} className={classes} onClick={onClick} {...buttonOnlyProps} {...rest}>
      {children}
    </Comp>
  );
});

export default Chip;
