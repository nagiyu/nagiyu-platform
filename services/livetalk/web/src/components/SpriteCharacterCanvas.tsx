'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { Box, Typography } from '@mui/material';
import type { LifecycleState } from '@nagiyu/livetalk-core';
import { getCharacterDisplay, getCharacterRenderProfile } from '@/lib/characters/client-profiles';

/**
 * SpriteCharacterCanvas のプロパティ。
 * StillImageCanvas と同じ再生コントラクト。
 */
export interface SpriteCharacterCanvasProps {
  /**
   * 表示するキャラクターの ID。省略時はレジストリの既定キャラクターを使用する。
   * 画像パスと alt テキストの取得に使用する。
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
 * 透過 PNG パーツを重ね合わせて瞬き＋音声連動口パクを行うコンポーネント。
 *
 * renderer:'sprite' キャラクター向けに、5 枚の透過 PNG（ベース・開いた目・閉じた目・
 * 開いた口・閉じた口）を絶対配置で重ね合わせて描画する。
 *
 * 瞬き: ランダム間隔（3000〜6000ms）で約 140ms かけて eyeClosed レイヤーの opacity を
 * 0 → 1 → 0 と変化させる三角波アニメーション。発話有無に関わらず常時駆動。
 *
 * 口パク: audioBuffer + audioContext が揃ったら Web Audio API（AudioBufferSourceNode +
 * AnalyserNode）で再生し、AnalyserNode の全周波数ビン平均を 0〜1 に正規化して
 * mouthOpen レイヤーの opacity を毎フレーム駆動する。
 *
 * iOS Safari 対策として HTMLAudio は使わず Web Audio のみ。
 * AudioContext は親が resume 済みの前提（PlaceholderCanvas / Live2DCanvas と同じ）。
 */
export default function SpriteCharacterCanvas({
  characterId,
  audioBuffer,
  audioContext,
  statusText,
  // lifecycleState は将来の拡張用。現時点では参照しない（sprite は sleeping 表現なし）
  lifecycleState: _lifecycleStateUnused, // eslint-disable-line @typescript-eslint/no-unused-vars
  onPlaybackEnd,
  onPlaybackError,
}: SpriteCharacterCanvasProps) {
  // eyeClosed レイヤーの div（opacity を直接操作する）
  const eyeClosedRef = useRef<HTMLDivElement | null>(null);
  // mouthOpen レイヤーの div（opacity を直接操作する）
  const mouthOpenRef = useRef<HTMLDivElement | null>(null);
  // 瞬き用 rAF キャンセル ID
  const blinkRafIdRef = useRef<number | null>(null);
  // 口パク用 rAF キャンセル ID
  const lipsyncRafIdRef = useRef<number | null>(null);

  // コールバックを ref 経由で参照することで、再生の useEffect が
  // 親側のコールバック識別子変更で再走するのを避ける
  const onPlaybackEndRef = useRef(onPlaybackEnd);
  const onPlaybackErrorRef = useRef(onPlaybackError);
  useEffect(() => {
    onPlaybackEndRef.current = onPlaybackEnd;
    onPlaybackErrorRef.current = onPlaybackError;
  }, [onPlaybackEnd, onPlaybackError]);

  // 瞬きアニメーション（常時駆動）。
  // Live2DCanvas の computeEyeOpen と同じ三角波ロジックを使用する。
  useEffect(() => {
    // 瞬きの設定値（Live2DCanvas と同じ値）
    const BLINK_DURATION_MS = 140;
    const BLINK_INTERVAL_MIN_MS = 3000;
    const BLINK_INTERVAL_RANGE_MS = 3000;

    let blinkStart = -Infinity;
    let nextBlinkAt =
      performance.now() + BLINK_INTERVAL_MIN_MS + Math.random() * BLINK_INTERVAL_RANGE_MS;

    /**
     * 三角波で瞬きの閉じ具合（0〜1）を計算する。
     * 瞬き窓外は 0（開いた状態）、窓内の half で最も閉じる（1）。
     */
    const computeCloseRatio = (now: number): number => {
      if (now >= nextBlinkAt && now > blinkStart + BLINK_DURATION_MS) {
        blinkStart = now;
        nextBlinkAt = now + BLINK_INTERVAL_MIN_MS + Math.random() * BLINK_INTERVAL_RANGE_MS;
      }
      const t = now - blinkStart;
      if (t >= 0 && t < BLINK_DURATION_MS) {
        const half = BLINK_DURATION_MS / 2;
        // 0 → 1 → 0（閉じ具合）。half で最も閉じる
        return t < half ? t / half : 1 - (t - half) / half;
      }
      return 0;
    };

    const animate = () => {
      blinkRafIdRef.current = requestAnimationFrame(animate);
      const closeRatio = computeCloseRatio(performance.now());
      if (eyeClosedRef.current) {
        eyeClosedRef.current.style.opacity = String(closeRatio);
      }
    };
    animate();

    return () => {
      if (blinkRafIdRef.current !== null) {
        cancelAnimationFrame(blinkRafIdRef.current);
        blinkRafIdRef.current = null;
      }
    };
  }, []);

  // 口パク（audioBuffer + audioContext が揃ったら Web Audio で再生して音量連動）。
  // PlaceholderCanvas と同じ AnalyserNode 設定・算出方法を踏襲する。
  useEffect(() => {
    if (!audioBuffer || !audioContext) return;

    let cancelled = false;
    let source: AudioBufferSourceNode | null = null;
    let analyser: AnalyserNode | null = null;

    try {
      source = audioContext.createBufferSource();
      source.buffer = audioBuffer;

      analyser = audioContext.createAnalyser();
      // fftSize・各種 dB 設定は PlaceholderCanvas / Live2DCanvas と合わせる
      analyser.fftSize = 256;
      analyser.minDecibels = -90;
      analyser.maxDecibels = -10;
      analyser.smoothingTimeConstant = 0.85;

      source.connect(analyser);
      analyser.connect(audioContext.destination);

      // requestAnimationFrame ループで音量レベルを算出して mouthOpen の opacity を駆動する
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const animateLipsync = () => {
        if (cancelled || !analyser) return;
        lipsyncRafIdRef.current = requestAnimationFrame(animateLipsync);

        analyser.getByteFrequencyData(dataArray);
        // 全周波数ビンの平均を 0〜255 → 0〜1 に正規化する（PlaceholderCanvas と同じ算出）
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length / 255;
        // 視認できるよう増幅し 0〜1 にクランプする
        const opacity = Math.min(1, avg * 2.2);

        if (mouthOpenRef.current) {
          mouthOpenRef.current.style.opacity = String(opacity);
        }
      };
      animateLipsync();

      source.onended = () => {
        if (cancelled) return;
        // rAF を止めて口を閉じた状態に戻す
        if (lipsyncRafIdRef.current !== null) {
          cancelAnimationFrame(lipsyncRafIdRef.current);
          lipsyncRafIdRef.current = null;
        }
        if (mouthOpenRef.current) {
          mouthOpenRef.current.style.opacity = '0';
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
      if (lipsyncRafIdRef.current !== null) {
        cancelAnimationFrame(lipsyncRafIdRef.current);
        lipsyncRafIdRef.current = null;
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

  // 画像パスと alt テキストを取得する（取得失敗時はフォールバック）
  let spritePaths: {
    base: string;
    eyeOpen: string;
    eyeClosed: string;
    mouthOpen: string;
    mouthClosed: string;
  } | null = null;
  let altText = '';
  try {
    const renderProfile = getCharacterRenderProfile(characterId);
    if (renderProfile.renderer === 'sprite') {
      spritePaths = renderProfile.sprite;
    }
  } catch {
    // 未登録 ID や renderer 不一致の場合は画像を出さず、フォールバック表示にする
  }
  try {
    altText = getCharacterDisplay(characterId).displayName;
  } catch {
    // 未登録 ID などの場合は空文字列のまま表示する
  }

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'background.default',
        position: 'relative',
        overflow: 'hidden',
      }}
      data-testid="sprite-canvas-container"
    >
      {spritePaths && (
        <>
          {/* ベース画像（目・口なし顔）: z 順の最下層 */}
          <Image
            src={spritePaths.base}
            alt={altText}
            fill
            unoptimized
            style={{ objectFit: 'contain' }}
            data-testid="sprite-base"
          />

          {/* 開いた目: 常時表示（opacity 固定 1） */}
          <Image
            src={spritePaths.eyeOpen}
            alt=""
            fill
            unoptimized
            style={{ objectFit: 'contain' }}
            data-testid="sprite-eye-open"
          />

          {/* 閉じた目: 瞬き時に opacity を上げる。div でラップして ref を持たせる */}
          <Box ref={eyeClosedRef} sx={{ position: 'absolute', inset: 0, opacity: 0 }}>
            <Image
              src={spritePaths.eyeClosed}
              alt=""
              fill
              unoptimized
              style={{ objectFit: 'contain' }}
              data-testid="sprite-eye-closed"
            />
          </Box>

          {/* 閉じた口: 常時表示（opacity 固定 1）のベース口 */}
          <Image
            src={spritePaths.mouthClosed}
            alt=""
            fill
            unoptimized
            style={{ objectFit: 'contain' }}
            data-testid="sprite-mouth-closed"
          />

          {/* 開いた口: 発話時に音量連動で opacity を上げる。div でラップして ref を持たせる */}
          <Box ref={mouthOpenRef} sx={{ position: 'absolute', inset: 0, opacity: 0 }}>
            <Image
              src={spritePaths.mouthOpen}
              alt=""
              fill
              unoptimized
              style={{ objectFit: 'contain' }}
              data-testid="sprite-mouth-open"
            />
          </Box>
        </>
      )}

      {/* ステータステキスト（PlaceholderCanvas / Live2DCanvas と同様に下部に表示） */}
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
