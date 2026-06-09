'use client';

import dynamic from 'next/dynamic';
import { CircularProgress, Box, Typography } from '@mui/material';
import type { LifecycleState } from '@nagiyu/livetalk-core';
import { getCharacterRenderProfile } from '@/lib/characters/client-profiles';
import PlaceholderCanvas from '@/components/PlaceholderCanvas';
import StillImageCanvas from '@/components/StillImageCanvas';

/**
 * CharacterCanvas のプロパティ。
 * renderer 種別に関わらず、page.tsx が Live2DCanvas に渡していた props と同一にする。
 */
export interface CharacterCanvasProps {
  /**
   * 表示するキャラクターの ID。省略時はレジストリの既定キャラクターを使用する。
   */
  characterId?: string;
  /**
   * 再生対象の AudioBuffer。null または undefined のときは再生しない。
   *
   * iOS Safari の HTMLAudioElement autoplay 制約回避のため HTMLAudio は使わず
   * Web Audio API の AudioBufferSourceNode を直接使う。
   */
  audioBuffer?: AudioBuffer | null;
  /**
   * 再生に使う AudioContext。親側で user gesture 中に resume 済みである前提。
   */
  audioContext?: AudioContext | null;
  /** 「考え中 / 話している / 待機中」の状態テキスト */
  statusText?: string;
  /**
   * 生活サイクル状態。live2d renderer では sleeping 時に目を半開きに固定する。
   */
  lifecycleState?: LifecycleState;
  /** 音声再生完了時のコールバック */
  onPlaybackEnd?: () => void;
  /** 音声再生エラー時のコールバック */
  onPlaybackError?: (error: Error) => void;
}

/**
 * Live2DCanvas の動的 import（ssr:false）をこのコンポーネント内に閉じ込め、
 * page.tsx から描画の詳細を隠蔽する。
 *
 * PixiJS + pixi-live2d-display は browser API を直接使うため SSR 不可。
 * live2d renderer のときのみ動的 import をマウントする。
 */
const Live2DCanvas = dynamic(() => import('@/components/Live2DCanvas'), {
  ssr: false,
  loading: ({ error }) => (error ? null : <Live2DCanvasFallback statusText="読み込み中…" />),
});

/**
 * Live2DCanvas 読み込み中のフォールバック表示。
 * CharacterCanvas の loading prop で使用する。
 */
function Live2DCanvasFallback({ statusText }: { statusText?: string }) {
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
        gap: 1,
      }}
      data-testid="live2d-canvas-fallback"
    >
      <CircularProgress size={32} />
      <Typography variant="caption" color="text.secondary">
        {statusText ?? '待機中'}
      </Typography>
    </Box>
  );
}

/**
 * キャラクター描画の抽象化レイヤー。
 *
 * getCharacterRenderProfile で renderer 種別を判定し、
 * - 'live2d': PixiJS + pixi-live2d-display による Live2D 描画（ssr:false 動的 import）
 * - 'still': 完成した一枚絵（静止画）の描画（SSR 可・静的 import）
 * - 'placeholder': シルエット + 名前ラベル + 音声連動口パクによるプレースホルダー描画
 *
 * page.tsx はこのコンポーネントに同じ props を渡すだけでよく、
 * renderer の詳細を知る必要がない。
 */
export default function CharacterCanvas(props: CharacterCanvasProps) {
  const renderProfile = getCharacterRenderProfile(props.characterId);

  if (renderProfile.renderer === 'live2d') {
    return <Live2DCanvas {...props} />;
  }

  if (renderProfile.renderer === 'still') {
    // img + Web Audio のみで SSR 可。PlaceholderCanvas と同様に静的 import を使う。
    return <StillImageCanvas {...props} />;
  }

  // 'placeholder': PlaceholderCanvas を描画する
  return <PlaceholderCanvas {...props} />;
}
