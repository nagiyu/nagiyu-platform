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
 * 瞬き: ランダム間隔（3000〜6000ms）で約 180ms だけ eyeClosed レイヤーを opacity 1（閉じ）
 * にする二値スナップ。パッと閉じてパッと開く。発話有無に関わらず常時駆動。
 *
 * 口パク: audioBuffer + audioContext が揃ったら Web Audio API（AudioBufferSourceNode +
 * AnalyserNode）で再生し、AnalyserNode の全周波数ビン平均を 0〜1 に正規化して、
 * しきい値（ヒステリシス付き）で mouthOpen / mouthClosed レイヤーを排他で開閉二値
 * （opacity 0/1）切替する。開いている間は閉じた口を隠し、下から透けないようにする。
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
  // mouthOpen / mouthClosed レイヤーの div（opacity を直接操作し、開/閉を排他切替する）
  const mouthOpenRef = useRef<HTMLDivElement | null>(null);
  const mouthClosedRef = useRef<HTMLDivElement | null>(null);
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
  // ぬるっとした三角波フェードではなく、パッと閉じてパッと開く二値（0/1）スナップにする。
  useEffect(() => {
    // 瞬きの設定値。BLINK_CLOSED_MS の間だけ目を完全に閉じる（dev 実機で調整可）。
    // 一瞬すぎて分かりにくかったため、閉じている時間をやや長め（180ms）にする。
    const BLINK_CLOSED_MS = 180;
    const BLINK_INTERVAL_MIN_MS = 3000;
    const BLINK_INTERVAL_RANGE_MS = 3000;

    let blinkStart = -Infinity;
    let nextBlinkAt =
      performance.now() + BLINK_INTERVAL_MIN_MS + Math.random() * BLINK_INTERVAL_RANGE_MS;

    /**
     * 瞬きの閉じ状態（0=開き / 1=閉じ）を二値で計算する。
     * nextBlinkAt に達したら瞬きを開始し、BLINK_CLOSED_MS の間だけ 1（閉じ）を返す。
     */
    const computeClosed = (now: number): number => {
      if (now >= nextBlinkAt && now > blinkStart + BLINK_CLOSED_MS) {
        blinkStart = now;
        nextBlinkAt = now + BLINK_INTERVAL_MIN_MS + Math.random() * BLINK_INTERVAL_RANGE_MS;
      }
      const t = now - blinkStart;
      return t >= 0 && t < BLINK_CLOSED_MS ? 1 : 0;
    };

    const animate = () => {
      blinkRafIdRef.current = requestAnimationFrame(animate);
      const closed = computeClosed(performance.now());
      if (eyeClosedRef.current) {
        eyeClosedRef.current.style.opacity = String(closed);
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
      // fftSize・dB 範囲は PlaceholderCanvas / Live2DCanvas と合わせる。
      // smoothingTimeConstant は開閉の追従を素早くするため低め（0.5）にする。
      analyser.fftSize = 256;
      analyser.minDecibels = -90;
      analyser.maxDecibels = -10;
      analyser.smoothingTimeConstant = 0.5;

      source.connect(analyser);
      analyser.connect(audioContext.destination);

      // requestAnimationFrame ループで音量レベルを算出して mouthOpen を二値（開/閉）で駆動する。
      // ぬるっとした連続フェードをやめ、しきい値で口をパッと開閉する。
      // 開く閾値 > 閉じる閾値のヒステリシスで、境界付近のチラつき（パカパカ）を抑える（dev で調整可）。
      const MOUTH_OPEN_THRESHOLD = 0.1;
      const MOUTH_CLOSE_THRESHOLD = 0.05;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let mouthIsOpen = false;
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

        // ヒステリシス付きで開閉状態を更新する
        if (!mouthIsOpen && avg >= MOUTH_OPEN_THRESHOLD) {
          mouthIsOpen = true;
        } else if (mouthIsOpen && avg < MOUTH_CLOSE_THRESHOLD) {
          mouthIsOpen = false;
        }

        // 開/閉を排他で切り替える（開いている間は閉じた口を隠して下から透けないようにする）
        if (mouthOpenRef.current) {
          mouthOpenRef.current.style.opacity = mouthIsOpen ? '1' : '0';
        }
        if (mouthClosedRef.current) {
          mouthClosedRef.current.style.opacity = mouthIsOpen ? '0' : '1';
        }
      };
      animateLipsync();

      source.onended = () => {
        if (cancelled) return;
        // rAF を止めて口を閉じた状態に戻す（開いた口を隠し、閉じた口を表示する）
        if (lipsyncRafIdRef.current !== null) {
          cancelAnimationFrame(lipsyncRafIdRef.current);
          lipsyncRafIdRef.current = null;
        }
        if (mouthOpenRef.current) {
          mouthOpenRef.current.style.opacity = '0';
        }
        if (mouthClosedRef.current) {
          mouthClosedRef.current.style.opacity = '1';
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

          {/* 閉じた口: 待機時に表示。発話で口が開いている間は opacity 0 にして下から透けないようにする */}
          <Box ref={mouthClosedRef} sx={{ position: 'absolute', inset: 0, opacity: 1 }}>
            <Image
              src={spritePaths.mouthClosed}
              alt=""
              fill
              unoptimized
              style={{ objectFit: 'contain' }}
              data-testid="sprite-mouth-closed"
            />
          </Box>

          {/* 開いた口: 発話時に表示。閉じた口と排他で切り替える。div でラップして ref を持たせる */}
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
