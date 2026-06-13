'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';

/**
 * useAudioQueue の内部 reducer state。
 *
 * isPlaying は current !== null で導出できるため保持しない。
 */
interface AudioQueueState {
  /** 再生待ちバッファの列。先頭から順に再生される。 */
  queue: AudioBuffer[];
  /** 現在再生中のバッファ（null = 再生中なし）。CharacterCanvas に渡す。 */
  current: AudioBuffer | null;
  /** ストリームが完了したかどうか（done/error イベントで true になる）。 */
  streamDone: boolean;
}

type AudioQueueAction =
  | { type: 'ENQUEUE'; buffer: AudioBuffer }
  | { type: 'PLAYBACK_END' }
  | { type: 'PLAYBACK_ERROR' }
  | { type: 'MARK_STREAM_DONE' }
  | { type: 'RESET' };

const initialState: AudioQueueState = {
  queue: [],
  current: null,
  streamDone: false,
};

/**
 * 音声キューの状態遷移 reducer。
 *
 * 状態遷移の対応関係（旧実装 → reducer アクション）:
 * - clearAudioQueue: RESET
 * - advanceAudioQueue（キュー先頭を current に移す）: ENQUEUE / PLAYBACK_END / PLAYBACK_ERROR / MARK_STREAM_DONE の末尾で暗黙に実行
 * - sentence 受信時の push + advance: ENQUEUE
 * - done/error イベント時の streamDone=true + advance: MARK_STREAM_DONE
 * - handlePlaybackEnd の isPlaying=false + advance: PLAYBACK_END
 * - handlePlaybackError の isPlaying=false + advance: PLAYBACK_ERROR
 */
function audioQueueReducer(state: AudioQueueState, action: AudioQueueAction): AudioQueueState {
  switch (action.type) {
    case 'ENQUEUE': {
      // 再生中でなければ即 current に昇格し再生開始。再生中なら queue に追加。
      if (state.current === null) {
        return { ...state, current: action.buffer };
      }
      return { ...state, queue: [...state.queue, action.buffer] };
    }
    case 'PLAYBACK_END':
    case 'PLAYBACK_ERROR': {
      // 現在の再生終了 → キューの先頭を次の current に昇格
      const [next, ...rest] = state.queue;
      return {
        ...state,
        current: next ?? null,
        queue: rest,
      };
    }
    case 'MARK_STREAM_DONE': {
      // ストリーム完了マーク。再生中でなくキューも空なら drain 判定のトリガーになる。
      // （onDrained の発火は useEffect で監視する）
      if (state.current === null && state.queue.length === 0) {
        // キューも current も空 → drain 可能な状態に遷移
        return { ...state, streamDone: true };
      }
      return { ...state, streamDone: true };
    }
    case 'RESET': {
      return { ...initialState };
    }
    default: {
      return state;
    }
  }
}

/**
 * useAudioQueue のオプション。
 */
export interface UseAudioQueueOptions {
  /**
   * キューが空になりストリームも完了した（drain した）瞬間に呼ばれるコールバック。
   * page 側で `setPhase('idle')` するために使う。
   *
   * ref に退避して effect の依存から外すため、参照変更による誤発火は起きない。
   */
  onDrained: () => void;
}

/**
 * useAudioQueue の戻り値型。
 */
export interface UseAudioQueueResult {
  /**
   * 現在再生中のバッファ（CharacterCanvas に prop で渡す）。
   * 再生中でなければ null。
   */
  audioBuffer: AudioBuffer | null;
  /**
   * decode 済みバッファをキューに追加する。
   * キューが空（再生中なし）なら即座に再生開始する。
   * sentence 受信時に呼ぶ。
   */
  enqueue: (buffer: AudioBuffer) => void;
  /**
   * ストリーム完了をマークする。
   * done/error イベント受信時に呼ぶ。
   * キューと current がどちらも空なら onDrained を発火させる。
   */
  markStreamDone: () => void;
  /**
   * キューを初期化する（clearAudioQueue 相当）。
   * handleSubmit 冒頭で呼ぶ。
   */
  reset: () => void;
  /**
   * 再生完了コールバック（CharacterCanvas の onPlaybackEnd に渡す）。
   * current を null にしてキューの次バッファへ進む。
   */
  handlePlaybackEnd: () => void;
  /**
   * 再生エラー時の advance のみを担当するコールバック。
   * ログ・setErrorMessage・reportClientError は呼び出し側（page）に残す。
   */
  handlePlaybackError: () => void;
}

/**
 * 音声キューを useReducer ベースの state machine で管理するカスタム hook。
 *
 * 旧実装の audioQueueRef / isPlayingRef / streamDoneRef / audioBuffer state の
 * 手動管理を置き換える。挙動は旧実装と厳密に同一。
 *
 * 順序保証: useReducer の dispatch は同期的に順次適用されるため、
 * sentence の連続到着でも取りこぼしなく順番再生される。
 *
 * onDrained の誤発火防止: streamDone=false の初期状態では onDrained は発火しない。
 * reset 直後は streamDone=false に戻るため、reset 後の drain 誤発火も起きない。
 */
export function useAudioQueue(options: UseAudioQueueOptions): UseAudioQueueResult {
  const [state, dispatch] = useReducer(audioQueueReducer, initialState);

  // onDrained を ref に退避することで、useEffect の依存配列から外し、
  // コールバック参照変更による誤発火を防ぐ
  const onDrainedRef = useRef(options.onDrained);
  useEffect(() => {
    onDrainedRef.current = options.onDrained;
  }, [options.onDrained]);

  // drain 判定: streamDone=true かつ current=null かつ queue 空のとき onDrained を発火
  // reset 直後は streamDone=false なので発火しない（誤発火防止）
  useEffect(() => {
    if (state.streamDone && state.current === null && state.queue.length === 0) {
      onDrainedRef.current();
    }
    // state 変化のみに依存する（onDrainedRef は ref なので依存不要）
  }, [state.streamDone, state.current, state.queue]);

  const enqueue = useCallback((buffer: AudioBuffer) => {
    dispatch({ type: 'ENQUEUE', buffer });
  }, []);

  const markStreamDone = useCallback(() => {
    dispatch({ type: 'MARK_STREAM_DONE' });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  const handlePlaybackEnd = useCallback(() => {
    dispatch({ type: 'PLAYBACK_END' });
  }, []);

  const handlePlaybackError = useCallback(() => {
    dispatch({ type: 'PLAYBACK_ERROR' });
  }, []);

  return {
    audioBuffer: state.current,
    enqueue,
    markStreamDone,
    reset,
    handlePlaybackEnd,
    handlePlaybackError,
  };
}
