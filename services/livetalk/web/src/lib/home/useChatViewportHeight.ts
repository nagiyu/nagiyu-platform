'use client';

import { useLayoutEffect, useState } from 'react';

/**
 * 実寸を測れない間 (SSR・初回描画) のチャット画面の高さ。
 * ヘッダー・フッターの実寸が分からないため、`dvh` でアドレスバーを除いた画面の高さから
 * おおよその固定分を引いて、極端に崩れない値にしておく。
 */
export const CHAT_VIEWPORT_FALLBACK_HEIGHT = 'calc(100dvh - 128px)';

/**
 * アドレスバーを除いた画面の高さから、ヘッダーとフッターの実寸を引いた高さ (px) を測る。
 *
 * ヘッダー・フッターの高さは、フッターのライセンス表記の折り返しなどで画面幅ごとに変わるため、
 * 固定値で見積もらず実際の要素から取る。要素が見つからないときは測れないものとして null を返す。
 */
export function measureChatViewportHeight(): number | null {
  const header = document.querySelector('header');
  const footer = document.querySelector('footer');
  if (!header || !footer) {
    return null;
  }

  const height =
    window.innerHeight -
    header.getBoundingClientRect().height -
    footer.getBoundingClientRect().height;
  // 小数の端数で 1px はみ出して、ページ全体がスクロールするのを避ける
  return Math.max(0, Math.floor(height));
}

/**
 * チャット画面の高さ (CSS の height に渡せる文字列) を返す。
 *
 * `100vh` はモバイルでアドレスバーの分を含むため使わず、`window.innerHeight` から
 * ヘッダー・フッターの実寸を引いた値にする。画面サイズの変化と、ヘッダー・フッターの
 * 高さの変化 (ライセンス表記の折り返し等) の両方に追従する。
 * 測れるまでは {@link CHAT_VIEWPORT_FALLBACK_HEIGHT} を返す (SSR との不一致を避けるため、初期値は常にこれ)。
 */
export function useChatViewportHeight(): string {
  const [height, setHeight] = useState<number | null>(null);

  // paint 前に実寸へ差し替え、フォールバックの高さが一瞬見えるのを避ける
  useLayoutEffect(() => {
    const update = () => setHeight(measureChatViewportHeight());
    update();

    window.addEventListener('resize', update);

    // ヘッダー・フッターは画面サイズ以外の理由 (表記の折り返し・内容の差し替え) でも高さが変わる
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => update());
    const header = document.querySelector('header');
    const footer = document.querySelector('footer');
    if (header) observer?.observe(header);
    if (footer) observer?.observe(footer);

    return () => {
      window.removeEventListener('resize', update);
      observer?.disconnect();
    };
  }, []);

  return height === null ? CHAT_VIEWPORT_FALLBACK_HEIGHT : `${height}px`;
}
