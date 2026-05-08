'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';

import styles from './Link.module.css';

/**
 * Link の色（意味）。Button / Chip と同じセマンティック軸に `inherit` を加える。
 *
 * - `inherit`: 親の文字色を継承（フッター・ヘッダー等のコンテクストで使う）
 */
export type LinkColor =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'success'
  | 'warning'
  | 'neutral'
  | 'inherit';

/**
 * Link の下線の表示方法。
 *
 * - `none`: 下線なし
 * - `hover`: hover 時のみ下線（既定）
 * - `always`: 常に下線
 */
export type LinkUnderline = 'none' | 'hover' | 'always';

/**
 * Link のプロパティ。
 *
 * 100% ライブラリ非依存の独自定義。MUI / Radix 等の Props 型は extends しない。
 * エスケープハッチは `className` のみ。
 */
export interface LinkProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'color'> {
  /**
   * 色（意味）。既定: `primary`
   */
  color?: LinkColor;
  /**
   * 下線の表示方法。既定: `hover`
   */
  underline?: LinkUnderline;
  /**
   * `true` の場合、Radix Slot により子要素に Props をマージする。
   * Next.js の `<Link>` を Link 風スタイルで装飾したい場合などに使う。
   */
  asChild?: boolean;
  /**
   * 子要素（テキスト、または `asChild` 時は単一要素）。
   */
  children: React.ReactNode;
}

/**
 * テキスト・リンクコンポーネント（スタイル付き `<a>`）。
 *
 * - `color` × `underline` で見た目を制御
 * - `asChild` で `next/link` の `<Link>` 等への変身に対応（Radix Slot パターン）
 * - `target="_blank"` などの HTML 属性は素通し
 *
 * @see docs/development/shared-ui-components.md
 */
const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { color = 'primary', underline = 'hover', asChild = false, className, children, ...rest },
  ref
) {
  const Comp: React.ElementType = asChild ? Slot : 'a';

  const classes = [
    styles.link,
    styles[`color-${color}`],
    styles[`underline-${underline}`],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Comp ref={ref as never} className={classes} {...rest}>
      {children}
    </Comp>
  );
});

export default Link;
