'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { Box, Typography } from '@mui/material';
import type { LifecycleState } from '@nagiyu/livetalk-core';
import { getCharacterDisplay, getCharacterRenderProfile } from '@/lib/characters/client-profiles';

/**
 * StillImageCanvas のプロパティ。
 * PlaceholderCanvas と同じ再生コントラクトに合わせる。
 */
export interface StillImageCanvasProps {
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
 * 完成した一枚絵（静止画）を表示するコンポーネント。
 *
 * renderer:'still' キャラクター向けに、CloudFront/S3 から配信される一枚絵画像を表示する。
 * 瞬き・口パクなどのアニメーションは一切行わない（将来は別レンダラで対応予定）。
 *
 * 音声再生は Web Audio API（AudioBufferSourceNode）で行い、
 * 画像へのアニメーション連動はしない（source → destination の直結のみ）。
 *
 * iOS Safari 対策として HTMLAudio は使わず Web Audio のみ。
 * AudioContext は親が resume 済みの前提（PlaceholderCanvas / Live2DCanvas と同じ）。
 */
export default function StillImageCanvas({
  characterId,
  audioBuffer,
  audioContext,
  statusText,
  // lifecycleState は将来の拡張用。現時点では参照しない（静止画に sleeping 表現なし）
  lifecycleState: _lifecycleStateUnused, // eslint-disable-line @typescript-eslint/no-unused-vars
  onPlaybackEnd,
  onPlaybackError,
}: StillImageCanvasProps) {
  // コールバックを ref 経由で参照することで、再生の useEffect が
  // 親側のコールバック識別子変更で再走するのを避ける
  const onPlaybackEndRef = useRef(onPlaybackEnd);
  const onPlaybackErrorRef = useRef(onPlaybackError);
  useEffect(() => {
    onPlaybackEndRef.current = onPlaybackEnd;
    onPlaybackErrorRef.current = onPlaybackError;
  }, [onPlaybackEnd, onPlaybackError]);

  // audioBuffer + audioContext を受け取ったら Web Audio で再生する。
  // 口パク・拡大発光などのアニメーションは行わない（source → destination の直結のみ）。
  useEffect(() => {
    if (!audioBuffer || !audioContext) return;

    let cancelled = false;
    let source: AudioBufferSourceNode | null = null;

    try {
      source = audioContext.createBufferSource();
      source.buffer = audioBuffer;

      source.connect(audioContext.destination);

      source.onended = () => {
        if (cancelled) return;
        onPlaybackEndRef.current?.();
      };

      source.start(0);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      onPlaybackErrorRef.current?.(error);
    }

    return () => {
      cancelled = true;
      try {
        source?.stop();
      } catch {
        // 既に停止済み・未開始など。無視。
      }
      source?.disconnect();
    };
  }, [audioBuffer, audioContext]);

  // 画像パスと alt テキストを取得する（取得失敗時はフォールバック）
  let imagePath: string | null = null;
  let altText = '';
  try {
    const renderProfile = getCharacterRenderProfile(characterId);
    if (renderProfile.renderer === 'still') {
      imagePath = renderProfile.imagePath;
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
      data-testid="still-image-container"
    >
      {/* 一枚絵画像（CloudFront/S3 配信のため unoptimized 必須） */}
      {imagePath && (
        <Image
          src={imagePath}
          alt={altText}
          fill
          unoptimized
          style={{ objectFit: 'contain' }}
          sizes="(max-width: 600px) 100vw, 360px"
          data-testid="still-image"
        />
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
