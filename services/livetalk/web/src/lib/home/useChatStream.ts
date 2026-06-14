'use client';

import { type Dispatch, type SetStateAction, useCallback, useRef, useState } from 'react';
import type { LifecycleState, SafetyResource } from '@nagiyu/livetalk-core';
import { reportClientError } from '../client-logger';
import type { ChatPhase } from './types';

/**
 * NDJSON ストリームのイベント型。
 */
type ChatStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'sentence'; index: number; text: string; audio: string }
  | {
      type: 'safety';
      trigger: 'input_keyword' | 'output_moderation';
      resources: SafetyResource[];
      replacementText?: string;
    }
  | { type: 'lifecycle'; state: LifecycleState }
  | { type: 'done' }
  | { type: 'error'; message: string };

/**
 * base64 文字列を ArrayBuffer に変換するユーティリティ関数。
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * useChatStream への依存を注入する引数型。
 *
 * phase/setPhase は page.tsx の useState のまま残す。
 * useAudioQueue の onDrained が setPhase('idle') を呼ぶため、
 * useChatStream 内に phase を持たせると循環依存になる。
 */
export interface UseChatStreamDeps {
  /** カレントキャラクター ID */
  characterId: string;
  /** ChatPhase の setter（page.tsx の useState から渡す） */
  setPhase: Dispatch<SetStateAction<ChatPhase>>;
  /** AudioContext を unlock する関数（iOS Safari autoplay 制約対策） */
  ensureUnlocked: () => Promise<void>;
  /** AudioContext インスタンスを取得する関数 */
  getContext: () => AudioContext | null;
  /** decode 済み AudioBuffer をキューに追加する関数 */
  enqueue: (buffer: AudioBuffer) => void;
  /** ストリーム完了をマークする関数 */
  markStreamDone: () => void;
  /** 音声キューをリセットする関数（useAudioQueue の reset） */
  resetAudioQueue: () => void;
  /** 再生エラー時にキューを advance する関数（useAudioQueue の handlePlaybackError） */
  advanceOnError: () => void;
  /** knowledgeId を取り出してクリアする関数（クロス汚染防止ガード付き） */
  consumeKnowledgeId: (currentCharacterId: string) => string | null;
  /** 第一声テキストをクリアする関数 */
  clearFirstWordText: () => void;
  /** オンボーディングテキストをクリアする関数 */
  clearOnboardingText: () => void;
  /** ライフサイクル状態を更新する setter */
  setLifecycleState: Dispatch<SetStateAction<LifecycleState>>;
}

/**
 * useChatStream の戻り値型。
 */
export interface UseChatStreamResult {
  /** ユーザー入力テキスト（送信済み） */
  userText: string | null;
  /** AI 応答テキスト（逐次追記） */
  responseText: string | null;
  /** エラーメッセージ（null = エラーなし） */
  errorMessage: string | null;
  /** セーフティモーダルの表示状態 */
  safetyOpen: boolean;
  /** セーフティリソース一覧 */
  safetyResources: SafetyResource[];
  /** セーフティモーダルを閉じる関数 */
  closeSafety: () => void;
  /** チャット送信ハンドラ */
  handleSubmit: (text: string) => Promise<void>;
  /** 音声再生エラーハンドラ（CharacterCanvas の onPlaybackError に渡す） */
  handlePlaybackError: (error: Error) => void;
}

/**
 * チャット送信フロー（handleSubmit + NDJSON parse + ストリームイベント分岐 + handlePlaybackError）
 * を管理するカスタム hook。
 *
 * phase/setPhase は page.tsx の useState のまま残す設計（useAudioQueue との循環依存回避）。
 * setPhase を deps として受け取り、loading/streaming/idle の遷移はこの hook 内から呼ぶ。
 */
export function useChatStream(deps: UseChatStreamDeps): UseChatStreamResult {
  const {
    characterId,
    setPhase,
    ensureUnlocked,
    getContext,
    enqueue,
    markStreamDone,
    resetAudioQueue,
    advanceOnError,
    consumeKnowledgeId,
    clearFirstWordText,
    clearOnboardingText,
    setLifecycleState,
  } = deps;

  const [userText, setUserText] = useState<string | null>(null);
  const [responseText, setResponseText] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [safetyResources, setSafetyResources] = useState<SafetyResource[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const sentenceReceivedRef = useRef(0);

  const closeSafety = useCallback(() => {
    setSafetyOpen(false);
  }, []);

  const handleSubmit = useCallback(
    async (text: string) => {
      // user gesture の同期スタック内で AudioContext を resume する（iOS Safari 対策）
      await ensureUnlocked();
      const audioCtx = getContext();

      // 前回リクエストをキャンセル
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // 送信前に第一声 knowledgeId を取り出してクリア（1 ターン限り有効）。
      // クロス汚染防止: カレントキャラ == 通知元キャラのときのみ渡す（C3-3）。
      const notifKnowledgeId = consumeKnowledgeId(characterId);

      setUserText(text);
      setResponseText('');
      clearFirstWordText();
      clearOnboardingText();
      setErrorMessage(null);
      setPhase('loading');
      // キューをリセット（setAudioBuffer(null) + clearAudioQueue() 相当）
      resetAudioQueue();
      sentenceReceivedRef.current = 0;

      try {
        const chatBody: { text: string; characterId?: string; knowledgeId?: string } = {
          text,
          characterId,
        };
        if (notifKnowledgeId) chatBody.knowledgeId = notifKnowledgeId;

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(chatBody),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          setErrorMessage('応答の取得に失敗しました。時間を置いて再度お試しください。');
          setPhase('idle');
          reportClientError('error', 'チャット fetch 失敗', `HTTP ${response.status}`, {
            screen: 'chat',
            audioContextState: getContext()?.state,
          });
          return;
        }

        setPhase('streaming');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let lineBuffer = '';

        const handleEvent = async (event: ChatStreamEvent) => {
          if (event.type === 'text') {
            setResponseText((prev) => (prev ?? '') + event.delta);
          } else if (event.type === 'sentence' && event.audio) {
            sentenceReceivedRef.current++;
            if (!audioCtx) {
              // AudioContext が無いブラウザ（極めて稀）: 音声をスキップしてテキストだけ表示
              return;
            }
            try {
              const arrayBuffer = base64ToArrayBuffer(event.audio);
              const decoded = await audioCtx.decodeAudioData(arrayBuffer);
              // decode 済みバッファをキューに追加（空きなら即再生開始）
              enqueue(decoded);
            } catch (err) {
              console.error('[LiveTalk] 音声 decode に失敗しました', err);
              reportClientError(
                'warning',
                '音声 decode 失敗',
                err instanceof Error ? err.message : '不明なエラー',
                {
                  screen: 'chat',
                  audioContextState: getContext()?.state,
                  sentenceReceived: sentenceReceivedRef.current,
                }
              );
            }
          } else if (event.type === 'lifecycle') {
            setLifecycleState(event.state);
          } else if (event.type === 'safety') {
            if (event.trigger === 'output_moderation' && event.replacementText) {
              setResponseText(event.replacementText);
            }
            setSafetyResources(event.resources);
            setSafetyOpen(true);
          } else if (event.type === 'done') {
            // ストリーム完了をマーク（キューと current が空なら onDrained → setPhase('idle')）
            markStreamDone();
          } else if (event.type === 'error') {
            setErrorMessage(event.message ?? '内部エラーが発生しました。');
            // ストリームエラー時もストリーム完了扱い（advance のみ hook に委譲）
            markStreamDone();
            reportClientError(
              'error',
              'チャット stream エラー',
              event.message ?? '内部エラーが発生しました',
              {
                screen: 'chat',
                audioContextState: getContext()?.state,
                sentenceReceived: sentenceReceivedRef.current,
                // markStreamDone 後なので streamDone は true
                streamDone: true,
              }
            );
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          lineBuffer += decoder.decode(value, { stream: true });
          const lines = lineBuffer.split('\n');
          lineBuffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              await handleEvent(JSON.parse(trimmed) as ChatStreamEvent);
            } catch {
              // malformed line はスキップ
            }
          }
        }

        // ストリーム終端の残余行
        if (lineBuffer.trim()) {
          try {
            await handleEvent(JSON.parse(lineBuffer.trim()) as ChatStreamEvent);
          } catch {
            // skip
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error('[LiveTalk] チャット応答の取得に失敗しました', error);
        setErrorMessage('エラーが発生しました。時間を置いて再度お試しください。');
        setPhase('idle');
        reportClientError(
          'error',
          'チャット通信エラー',
          error instanceof Error ? error.message : '不明なエラー',
          {
            screen: 'chat',
            audioContextState: getContext()?.state,
            sentenceReceived: sentenceReceivedRef.current,
            stack: error instanceof Error ? error.stack : undefined,
          }
        );
      }
    },
    [
      ensureUnlocked,
      getContext,
      resetAudioQueue,
      enqueue,
      markStreamDone,
      characterId,
      consumeKnowledgeId,
      clearFirstWordText,
      clearOnboardingText,
      setLifecycleState,
      setPhase,
    ]
  );

  const handlePlaybackError = useCallback(
    (error: Error) => {
      console.error('[LiveTalk] 音声再生エラー', error);
      setErrorMessage('音声再生中にエラーが発生しました。');
      // advance のみ hook に委譲（ログ・setErrorMessage・reportClientError はここで処理）
      advanceOnError();
      reportClientError('warning', '音声再生エラー', error.message, {
        screen: 'chat',
        audioContextState: getContext()?.state,
        sentenceReceived: sentenceReceivedRef.current,
      });
    },
    [advanceOnError, getContext]
  );

  return {
    userText,
    responseText,
    errorMessage,
    safetyOpen,
    safetyResources,
    closeSafety,
    handleSubmit,
    handlePlaybackError,
  };
}
