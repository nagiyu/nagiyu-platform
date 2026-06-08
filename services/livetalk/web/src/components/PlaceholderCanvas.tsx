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
 * 上半身のシルエット SVG と名前ラベルを表示し、音声に連動した口パクを駆動する。
 * 音声再生は Web Audio API（AudioBufferSourceNode + AnalyserNode）で行い、
 * requestAnimationFrame ループで音量レベルを算出してシルエットの口を開閉する。
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
  // 音量レベル（0〜1）を駆動する ref（requestAnimationFrame ループで更新）
  const mouthOpenRef = useRef(0);
  // SVG の口要素を直接操作するための ref
  const mouthRef = useRef<SVGEllipseElement | null>(null);
  // シルエット全体のスケール用コンテナの ref
  const silhouetteRef = useRef<SVGGElement | null>(null);
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
  // AnalyserNode から音量レベルを算出して口パクを駆動する
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

      // requestAnimationFrame ループで音量レベルを算出して口パクを駆動する
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
        mouthOpenRef.current = avg;

        // SVG の口楕円の rx / ry を更新して口パクを表現する
        // 口の高さ: 最小 2px 〜 最大 18px（CharacterArea の mouthHeight 相当）
        const mouthHeight = 2 + avg * 18;
        // シルエット全体のスケール: 1.0 〜 1.04（CharacterArea の scale 相当）
        const scale = 1 + avg * 0.04;

        if (mouthRef.current) {
          mouthRef.current.setAttribute('ry', String(mouthHeight / 2));
          // cy を mouthHeight に応じてわずかに調整（口の中心を固定）
          mouthRef.current.setAttribute('cy', String(155 + (mouthHeight - 2) / 2));
        }
        if (silhouetteRef.current) {
          silhouetteRef.current.setAttribute('transform', `scale(${scale})`);
        }
      };
      animate();

      source.onended = () => {
        if (cancelled) return;
        // rAF を止めて口を閉じる
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        mouthOpenRef.current = 0;
        if (mouthRef.current) {
          mouthRef.current.setAttribute('ry', '1');
          mouthRef.current.setAttribute('cy', '156');
        }
        if (silhouetteRef.current) {
          silhouetteRef.current.setAttribute('transform', 'scale(1)');
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

  // 名前ラベルを取得する（取得失敗時はフォールバック）
  let displayName = '';
  try {
    displayName = getCharacterDisplay(characterId).displayName;
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
      {/* シルエット + 名前ラベル */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 1,
        }}
      >
        {/* 上半身のシルエット SVG */}
        <svg
          width="180"
          height="220"
          viewBox="0 0 180 220"
          role="img"
          aria-label={`${displayName}のプレースホルダー`}
          data-testid="placeholder-silhouette"
        >
          {/*
           * シルエットは単色塗り（暗いグレー）で「仮の見た目」であることを示す。
           * transform の原点が SVG の左上隅になるため、シルエット中心付近を scale 原点にする。
           */}
          <g
            ref={silhouetteRef}
            style={{ transformOrigin: '90px 110px', transition: 'transform 60ms linear' }}
          >
            {/* 胴体（上半身） */}
            <rect x="55" y="155" width="70" height="65" rx="8" fill="#4a4a4a" />
            {/* 首 */}
            <rect x="78" y="135" width="24" height="25" rx="4" fill="#4a4a4a" />
            {/* 頭部 */}
            <ellipse cx="90" cy="100" rx="42" ry="46" fill="#4a4a4a" />
            {/* 髪（シンプルな上部のシルエット） */}
            <ellipse cx="90" cy="68" rx="44" ry="20" fill="#333333" />
            {/* 左肩 */}
            <ellipse cx="42" cy="170" rx="22" ry="14" fill="#4a4a4a" />
            {/* 右肩 */}
            <ellipse cx="138" cy="170" rx="22" ry="14" fill="#4a4a4a" />
            {/* 口（音声に連動して開閉する） */}
            <ellipse
              ref={mouthRef}
              cx="90"
              cy="156"
              rx="10"
              ry="1"
              fill="#2a2a2a"
              data-testid="placeholder-mouth"
            />
          </g>
        </svg>
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
