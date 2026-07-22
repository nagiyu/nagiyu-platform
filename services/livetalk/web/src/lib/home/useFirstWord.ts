'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * useFirstWord の戻り値型。
 */
export interface UseFirstWordResult {
  /** 第一声テキスト（未消化通知から取得）。null はまだ取得していないか消去済み。 */
  firstWordText: string | null;
  /** 通知タップ起動時の入力欄プリフィルテキスト。null はプリフィルなし。 */
  prefillText: string | null;
  /** handleSubmit 送信前に firstWordText をクリアする関数 */
  clearFirstWordText: () => void;
}

/**
 * カレントキャラの未消化通知を第一声として取得・表示するカスタム hook。
 *
 * 通知タップ起動時（from=push）かつ suggestedReply がある場合は prefillText を設定する。
 */
export function useFirstWord(characterId: string): UseFirstWordResult {
  const searchParams = useSearchParams();

  const [firstWordText, setFirstWordText] = useState<string | null>(null);
  const [prefillText, setPrefillText] = useState<string | null>(null);

  // カレント characterId の未消化通知を第一声として取得・表示する。
  useEffect(() => {
    setFirstWordText(null);

    fetch(`/api/push/first-word?characterId=${encodeURIComponent(characterId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            notifId: string;
            body: string;
            characterId: string;
            suggestedReply?: string | null;
          } | null
        ) => {
          if (!data) return;
          setFirstWordText(data.body);
          // 通知タップ起動時（from=push）かつ suggestedReply がある場合は入力欄へプリフィル
          if (searchParams.get('from') === 'push' && data.suggestedReply) {
            setPrefillText(data.suggestedReply);
          }
          // 消化済みマーク
          fetch('/api/push/consumed', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notifId: data.notifId }),
          }).catch(() => {});
        }
      )
      .catch(() => {});
    // searchParams の変化のみに依存せず characterId のみを依存として保つ
    // （searchParams は first-word 取得時の from/suggestedReply 判定に使うが、
    //  searchParams が変化しても再取得は不要。characterId が同一の場合は再 fetch しない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId]);

  const clearFirstWordText = useCallback(() => {
    setFirstWordText(null);
  }, []);

  return {
    firstWordText,
    prefillText,
    clearFirstWordText,
  };
}
