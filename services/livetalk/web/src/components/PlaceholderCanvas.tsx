'use client';

import { useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import type { LifecycleState } from '@nagiyu/livetalk-core';
import { getCharacterDisplay } from '@/lib/characters/client-profiles';

/**
 * PlaceholderCanvas のプロパティ。
 * Live2DCanvas と同じ再生コントラクトに合わせる。
 */
export interface PlaceholderCanvasProps {
  /**
   * 表示するキャラクターの ID。省略時はレジストリの既定キャラクターを使用する。
   * 名前ラベルの表示に使用する。
   */
  characterId?: string;
  /**
   * 再生対象の AudioBuffer。null または undefined のときは再生しない（待機表示）。
   *
   * iOS Safari の HTMLAudioElement autoplay 制約回避のため、HTMLAudio は使わず
   * Web Audio API の AudioBufferSourceNode を直接使う。
   */
  audioBuffer?: AudioBuffer | null;
  /**
   * 再生に使う AudioContext。親側で user gesture 中に resume 済みである前提。
   * audioBuffer が指定されているのに audioContext が null の場合は再生しない。
   */
  audioContext?: AudioContext | null;
  /** 「考え中 / 話している / 待機中」の状態テキスト */
  statusText?: string;
  /** 生活サイクル状態（現在は参照のみ・将来の拡張用） */
  lifecycleState?: LifecycleState;
  /** 音声再生完了時のコールバック */
  onPlaybackEnd?: () => void;
  /** 音声再生エラー時のコールバック */
  onPlaybackError?: (error: Error) => void;
}

/**
 * Live2D モデル未用意のキャラ向けプレースホルダー描画コンポーネント。
 *
 * 丸いアバター円（キャラの呼び名 shortName 入り）と名前ラベルを表示し、
 * 音声に連動してアバターが「ふわっと拡大＋発光」する。
 * 口パク・人型シルエットは使用しない。
 *
 * 音声再生は Web Audio API（AudioBufferSourceNode + AnalyserNode）で行い、
 * requestAnimationFrame ループで音量レベルを算出してアバターの scale と glow を駆動する。
 *
 * iOS Safari 対策として HTMLAudio は使わず Web Audio のみ。
 * AudioContext は親が resume 済みの前提（Live2DCanvas と同じ）。
 */
export default function PlaceholderCanvas({
  characterId,
  audioBuffer,
  audioContext,
  statusText,
  // lifecycleState は将来の拡張用。現時点では参照しない（プレースホルダーに sleeping 表現なし）
  lifecycleState: _lifecycleStateUnused, // eslint-disable-line @typescript-eslint/no-unused-vars
  onPlaybackEnd,
  onPlaybackError,
}: PlaceholderCanvasProps) {
  // アバター円の DOM 要素を直接操作するための ref（scale / glow 適用）
  const avatarRef = useRef<HTMLDivElement | null>(null);
  // rAF のキャンセル用 ID
  const rafIdRef = useRef<number | null>(null);

  // コールバックを ref 経由で参照することで、再生の useEffect が
  // 親側のコールバック識別子変更で再走するのを避ける
  const onPlaybackEndRef = useRef(onPlaybackEnd);
  const onPlaybackErrorRef = useRef(onPlaybackError);
  useEffect(() => {
    onPlaybackEndRef.current = onPlaybackEnd;
    onPlaybackErrorRef.current = onPlaybackError;
  }, [onPlaybackEnd, onPlaybackError]);

  // audioBuffer + audioContext を受け取ったら Web Audio で再生し、
  // AnalyserNode から音量レベルを算出してアバターの拡大・発光を駆動する
  useEffect(() => {
    if (!audioBuffer || !audioContext) return;

    let cancelled = false;
    let source: AudioBufferSourceNode | null = null;
    let analyser: AnalyserNode | null = null;

    try {
      source = audioContext.createBufferSource();
      source.buffer = audioBuffer;

      analyser = audioContext.createAnalyser();
      // fftSize 256 は Live2DCanvas の設定に合わせる
      analyser.fftSize = 256;
      analyser.minDecibels = -90;
      analyser.maxDecibels = -10;
      analyser.smoothingTimeConstant = 0.85;

      source.connect(analyser);
      analyser.connect(audioContext.destination);

      // requestAnimationFrame ループで音量レベルを算出してアバターの拡大・発光を駆動する
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const animate = () => {
        if (cancelled || !analyser) return;
        rafIdRef.current = requestAnimationFrame(animate);

        analyser.getByteFrequencyData(dataArray);
        // 全周波数ビンの平均を 0〜255 → 0〜1 に正規化する
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length / 255;

        // アバター円の scale: 1.0（idle）〜 1.06（最大音量）
        const scale = 1 + avg * 0.06;
        // 発光（box-shadow の blur / spread を音量で強める）
        const glowOpacity = 0.3 + avg * 0.7;
        const glowBlur = 8 + avg * 24;
        const glowSpread = 2 + avg * 8;

        if (avatarRef.current) {
          avatarRef.current.style.transform = `scale(${scale})`;
          avatarRef.current.style.boxShadow = `0 0 ${glowBlur}px ${glowSpread}px rgba(99, 102, 241, ${glowOpacity})`;
        }
      };
      animate();

      source.onended = () => {
        if (cancelled) return;
        // rAF を止めてアバターを idle 状態に戻す
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        if (avatarRef.current) {
          avatarRef.current.style.transform = 'scale(1)';
          avatarRef.current.style.boxShadow = '0 0 8px 2px rgba(99, 102, 241, 0.15)';
        }
        onPlaybackEndRef.current?.();
      };

      source.start(0);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      onPlaybackErrorRef.current?.(error);
    }

    return () => {
      cancelled = true;
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      try {
        source?.stop();
      } catch {
        // 既に停止済み・未開始など。無視。
      }
      source?.disconnect();
      analyser?.disconnect();
    };
  }, [audioBuffer, audioContext]);

  // 名前ラベルと呼び名を取得する（取得失敗時はフォールバック）
  let displayName = '';
  let shortName = '';
  try {
    const display = getCharacterDisplay(characterId);
    displayName = display.displayName;
    shortName = display.shortName;
  } catch {
    // 未登録 ID などの場合は空文字列のまま表示する
  }

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'background.default',
        position: 'relative',
        overflow: 'hidden',
      }}
      data-testid="placeholder-canvas-container"
    >
      {/* アバター円 + 名前ラベル */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
        }}
      >
        {/* 丸いアバター円（キャラの呼び名を中央に表示） */}
        <Box
          ref={avatarRef}
          role="img"
          aria-label={`${displayName}のプレースホルダー`}
          data-testid="placeholder-avatar"
          sx={{
            width: 140,
            height: 140,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #a5b4fc 0%, #818cf8 50%, #6366f1 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 8px 2px rgba(99, 102, 241, 0.15)',
            // 音量に応じて transition でなめらかに変化させる（rAF で直接更新するため transition はオフ）
            transition: 'none',
            userSelect: 'none',
          }}
        >
          <Typography
            variant="h5"
            sx={{
              color: '#ffffff',
              fontWeight: 'bold',
              letterSpacing: '0.05em',
              textShadow: '0 1px 4px rgba(0, 0, 0, 0.25)',
              lineHeight: 1,
            }}
            data-testid="placeholder-short-name"
          >
            {shortName}
          </Typography>
        </Box>

        {/* 名前ラベル */}
        {displayName && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontWeight: 'bold' }}
            data-testid="placeholder-name-label"
          >
            {displayName}
          </Typography>
        )}
      </Box>

      {/* ステータステキスト（Live2DCanvas と同様に下部に表示） */}
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          position: 'absolute',
          bottom: 4,
          left: 0,
          right: 0,
          textAlign: 'center',
        }}
      >
        {statusText ?? '待機中'}
      </Typography>
    </Box>
  );
}
