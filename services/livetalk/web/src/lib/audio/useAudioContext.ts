'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * useAudioContext の戻り値型。
 */
export interface UseAudioContextResult {
  /**
   * AudioContext インスタンス（子コンポーネントへ prop として渡す用）。
   * user gesture 前は null。
   */
  audioContext: AudioContext | null;
  /**
   * user gesture の同期スタックで呼ぶことで、iOS Safari の autoplay 制約を解除する。
   *
   * iOS Safari の Web Audio autoplay 制約対策。
   * user gesture（handleSubmit 等）の同期スタックで AudioContext を作成・resume することで、
   * 以降の AudioBufferSourceNode.start() が transient activation token を消費せず
   * いつでも再生可能になる。HTMLAudioElement の per-element 制約は別系統で、
   * この対策では効かないため、再生は Web Audio API のみで完結させる（CharacterCanvas 参照）。
   */
  ensureUnlocked: () => Promise<void>;
  /**
   * ref の最新値を同期で読む。
   * reportClientError 等で audioContext の状態を参照する際に使用する
   * （callback 内で最新値を読むため state ではなく ref を使う）。
   */
  getContext: () => AudioContext | null;
}

/**
 * AudioContext を管理するカスタム hook。
 *
 * iOS Safari の Web Audio autoplay 制約対策として、user gesture で
 * AudioContext を作成・resume する仕組みをカプセル化する。
 *
 * - audioContext: 子コンポーネント（CharacterCanvas）に prop で渡す state
 * - ensureUnlocked: handleSubmit 等の user gesture 同期スタックで呼ぶ
 * - getContext: callback 内で ref の最新値を同期参照する
 */
export function useAudioContext(): UseAudioContextResult {
  // 子コンポーネント（CharacterCanvas）に prop で渡すため state で持つ
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  // callback 内で最新値を同期参照するための ref
  const audioCtxRef = useRef<AudioContext | null>(null);

  const ensureUnlocked = useCallback(async () => {
    if (typeof window === 'undefined') return;
    // window.AudioContext ?? webkitAudioContext のフォールバック（iOS Safari 対応）
    const AudioContextClass =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioCtxRef.current) {
      const ctx = new AudioContextClass();
      audioCtxRef.current = ctx;
      // 子コンポーネント（CharacterCanvas）に prop で渡すため state も更新
      setAudioContext(ctx);
    }
    if (audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume();
    }
  }, []);

  const getContext = useCallback((): AudioContext | null => {
    return audioCtxRef.current;
  }, []);

  return { audioContext, ensureUnlocked, getContext };
}
