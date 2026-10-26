'use client';

import { useLayoutEffect, useRef } from 'react';

/**
 * スクロール領域の中身が変わるたびに、末尾までスクロールさせる ref を返す。
 *
 * 領域には自分の発言・応答 (ストリーミングで伸びる間も)・エラー・オンボーディング・通知のヒントが
 * 子コンポーネント経由で入る。state を列挙して依存に並べると追加のたびに漏れるため、
 * DOM の変化を見て、何が更新されても新しい発言が画面外に残らないようにする。
 */
export function useAutoScrollToEnd<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const scrollToEnd = () => {
      element.scrollTop = element.scrollHeight;
    };

    const observer = new MutationObserver(scrollToEnd);
    observer.observe(element, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return ref;
}
