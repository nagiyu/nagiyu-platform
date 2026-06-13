'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * useFirstWord の戻り値型。
 */
export interface UseFirstWordResult {
  /** 第一声テキスト（未消化通知から取得）。null はまだ取得していないか消去済み。 */
  firstWordText: string | null;
  /** 通知タップ起動時の入力欄プリフィルテキスト。null はプリフィルなし。 */
  prefillText: string | null;
  /**
   * handleSubmit 送信前に呼ぶ。クロス汚染防止ガードを適用して knowledgeId を取り出し、
   * 両 ref をクリアした上で結果を返す。
   *
   * クロス汚染防止: カレントキャラ == 通知元キャラのときのみ knowledgeId を返す（C3-3）。
   *
   * @param currentCharacterId 現在選択中のキャラクター ID
   * @returns 有効な knowledgeId（クロス汚染がある場合は null）
   */
  consumeKnowledgeId: (currentCharacterId: string) => string | null;
  /** handleSubmit 送信前に firstWordText をクリアする関数 */
  clearFirstWordText: () => void;
}

/**
 * カレントキャラの未消化通知を第一声として取得・表示するカスタム hook。
 *
 * characterId が変わるたびに再取得し、前のキャラの knowledgeId をクリアする。
 * 通知タップ起動時（from=push）かつ suggestedReply がある場合は prefillText を設定する。
 */
export function useFirstWord(characterId: string): UseFirstWordResult {
  const searchParams = useSearchParams();

  const [firstWordText, setFirstWordText] = useState<string | null>(null);
  const [prefillText, setPrefillText] = useState<string | null>(null);

  // 第一声の元となった KnowledgeID（次の chat 送信時に文脈として渡す）
  const firstWordKnowledgeIdRef = useRef<string | null>(null);
  // 第一声の通知元キャラクター ID（クロス汚染防止のためカレントと照合する）
  const firstWordCharacterIdRef = useRef<string | null>(null);

  // カレント characterId の未消化通知を第一声として取得・表示する。
  // characterId が変わるたびに再取得し、前のキャラの knowledgeId をクリアする。
  useEffect(() => {
    // キャラクター切替時は前のキャラの第一声 knowledgeId をクリアする（クロス汚染防止）
    firstWordKnowledgeIdRef.current = null;
    firstWordCharacterIdRef.current = null;
    setFirstWordText(null);

    fetch(`/api/push/first-word?characterId=${encodeURIComponent(characterId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            notifId: string;
            body: string;
            knowledgeId?: string | null;
            characterId: string;
            suggestedReply?: string | null;
          } | null
        ) => {
          if (!data) return;
          setFirstWordText(data.body);
          firstWordKnowledgeIdRef.current = data.knowledgeId ?? null;
          // 通知元キャラクター ID を保存（クロス汚染防止のためカレントと照合する）
          firstWordCharacterIdRef.current = data.characterId;
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

  /**
   * クロス汚染防止ガードを適用して knowledgeId を取り出し、両 ref をクリアする。
   * handleSubmit の送信前（273-280 行のロジックをそのまま移設）。
   */
  const consumeKnowledgeId = useCallback((currentCharacterId: string): string | null => {
    const firstWordNotifCharId = firstWordCharacterIdRef.current;
    const rawKnowledgeId = firstWordKnowledgeIdRef.current;
    const notifKnowledgeId =
      rawKnowledgeId !== null && firstWordNotifCharId === currentCharacterId
        ? rawKnowledgeId
        : null;
    firstWordKnowledgeIdRef.current = null;
    firstWordCharacterIdRef.current = null;
    return notifKnowledgeId;
  }, []);

  const clearFirstWordText = useCallback(() => {
    setFirstWordText(null);
  }, []);

  return {
    firstWordText,
    prefillText,
    consumeKnowledgeId,
    clearFirstWordText,
  };
}
