'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * 末尾からこの距離 (px) 以内なら「末尾付近にいる」とみなす。端数や慣性スクロールの余りを吸収する。
 * 大きくしすぎると、会話の領域が小さい短い画面で、少し上へ戻っただけでは読み返しと扱われなくなる。
 */
export const SCROLL_END_THRESHOLD = 24;

/**
 * スクロール領域が末尾付近にいるあいだ、中身や領域の高さが変わるたびに末尾へ追従させる。
 *
 * 領域には自分の発言・応答 (ストリーミングで伸びる間も)・エラー・オンボーディング・通知のヒントが
 * 子コンポーネント経由で入る。state を列挙して依存に並べると追加のたびに漏れるため、DOM の変化を見る。
 * 上へスクロールして読み返している間は追従せず、引き戻さない。
 *
 * 末尾付近かどうかは scroll イベントで更新する。中身の増加やソフトキーボードによる領域の縮小は
 * scroll イベントを起こさずに末尾との距離を広げるため、変化の後で距離を測ると「離れた」と誤判定する。
 *
 * @returns ref はスクロール領域に付ける。stickToEnd は自分の送信時に呼び、読み返し中でも末尾へ移して追従を再開する。
 */
export function useAutoScrollToEnd<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const stuckToEndRef = useRef(true);

  const stickToEnd = useCallback(() => {
    stuckToEndRef.current = true;
    const element = ref.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, []);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const followIfStuck = () => {
      if (stuckToEndRef.current) {
        element.scrollTop = element.scrollHeight;
      }
    };

    const handleScroll = () => {
      const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
      stuckToEndRef.current = distance <= SCROLL_END_THRESHOLD;
    };

    element.addEventListener('scroll', handleScroll, { passive: true });
    const mutationObserver = new MutationObserver(followIfStuck);
    mutationObserver.observe(element, { childList: true, subtree: true, characterData: true });
    // 領域自身の高さの変化 (ソフトキーボード・フォールバックから実寸への切り替え) にも合わせ直す
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(followIfStuck);
    resizeObserver?.observe(element);

    return () => {
      element.removeEventListener('scroll', handleScroll);
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
    };
  }, []);

  return { ref, stickToEnd };
}
