'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { HIYORI_MODEL_PATH } from '@/lib/character-renderer';

// beforeInteractive Script のネットワーク遅延を吸収するため、
// window.Live2DCubismCore が定義されるまで最大 timeout ms だけ待機する。
function waitForCubismCore(timeout = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as { Live2DCubismCore?: unknown }).Live2DCubismCore) {
      resolve();
      return;
    }
    const start = Date.now();
    const id = setInterval(() => {
      if ((window as { Live2DCubismCore?: unknown }).Live2DCubismCore) {
        clearInterval(id);
        resolve();
      } else if (Date.now() - start > timeout) {
        clearInterval(id);
        reject(new Error('Cubism Core のロードがタイムアウトしました'));
      }
    }, 50);
  });
}

export interface Live2DCanvasProps {
  /** 再生対象の音声 URL。null または undefined のときは再生しない。 */
  audioUrl?: string | null;
  statusText?: string;
  onPlaybackEnd?: () => void;
  onPlaybackError?: (error: Error) => void;
}

/**
 * PixiJS + pixi-live2d-display-lipsyncpatch で桃瀬ひよりを描画するキャンバスコンポーネント。
 *
 * Cubism Core (live2dcubismcore.min.js) は layout.tsx の <Script strategy="beforeInteractive">
 * で事前にロードされ window.Live2DCubismCore として参照可能な状態になっている前提。
 *
 * PixiJS v7 と pixi-live2d-display-lipsyncpatch は browser API を直接使うため
 * SSR 不可。next/dynamic + ssr:false で呼び出し元がラップする。
 *
 * audioUrl を受け取ると model.speak() を呼び、ライブラリ内部の AudioContext +
 * AnalyserNode で再生 + リップシンクをモデルの update サイクル内で同期駆動する。
 */
export default function Live2DCanvas({
  audioUrl,
  statusText,
  onPlaybackEnd,
  onPlaybackError,
}: Live2DCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<import('pixi.js').Application | null>(null);
  const modelRef = useRef<import('pixi-live2d-display-lipsyncpatch/cubism4').Live2DModel | null>(
    null
  );
  const loadedRef = useRef(false);
  const [modelReady, setModelReady] = useState(false);

  // コールバックは ref 経由で参照することで、speak の useEffect が
  // 親側のコールバック識別子変更で再走するのを避ける
  const onPlaybackEndRef = useRef(onPlaybackEnd);
  const onPlaybackErrorRef = useRef(onPlaybackError);
  useEffect(() => {
    onPlaybackEndRef.current = onPlaybackEnd;
    onPlaybackErrorRef.current = onPlaybackError;
  }, [onPlaybackEnd, onPlaybackError]);

  useEffect(() => {
    if (!containerRef.current || loadedRef.current) return;
    loadedRef.current = true;

    let cancelled = false;

    (async () => {
      // メイン entry (pixi-live2d-display-lipsyncpatch) は Cubism 2 + 4 両対応で
      // ブラウザ実行時に Cubism 2 ランタイム (live2d.min.js) を要求する。
      // 桃瀬ひよりは Cubism 4 モデル (model3.json) なので cubism4 サブモジュールから import する。
      const [{ Application, utils }, { Live2DModel }] = await Promise.all([
        import('pixi.js'),
        import('pixi-live2d-display-lipsyncpatch/cubism4'),
      ]);

      if (cancelled || !containerRef.current) return;

      // Cubism Core の読み込みを待機してから PixiJS / Live2D を初期化する
      try {
        await waitForCubismCore();
      } catch (err) {
        console.error('[Live2DCanvas]', err);
        return;
      }
      if (cancelled || !containerRef.current) return;

      // PixiJS ログを抑制
      utils.skipHello();

      const container = containerRef.current;
      const w = container.clientWidth || 360;
      const h = container.clientHeight || 480;

      const app = new Application({
        width: w,
        height: h,
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      appRef.current = app;
      container.appendChild(app.view as HTMLCanvasElement);

      try {
        const model = await Live2DModel.from(HIYORI_MODEL_PATH, {
          autoInteract: false,
          // PIXI Application のティッカーを渡してアイドルモーション・呼吸・まばたきを駆動する
          ticker: app.ticker,
        });
        if (cancelled) {
          model.destroy();
          return;
        }
        modelRef.current = model;

        // 上半身フォーカスのレイアウト。
        // anchor Y を 0.3 にすることで、顔〜胸のあたりが基準点（= canvas 中央）になる。
        // 結果として頭は画面上部、上半身が中央、足は画面下端より下に位置する。
        model.anchor.set(0.5, 0.3);

        // canvas に対するスケール。縦は 95% × 1.5 倍を上限（上半身フォーカスのためのズーム）。
        // 横は 140% まで許容（モデル枠 = キャラ本体ではなく余白を含む。少しはみ出してもキャラは収まる）。
        const scaleByHeight = (h * 0.95 * 1.5) / model.height;
        const scaleByWidth = (w * 1.4) / model.width;
        const scale = Math.min(scaleByHeight, scaleByWidth);
        model.scale.set(scale);

        // アンカー基準点を canvas 中央に配置
        model.x = w / 2;
        model.y = h / 2;

        app.stage.addChild(model);
        setModelReady(true);
      } catch (err) {
        console.error('[Live2DCanvas] モデルのロードに失敗しました', err);
      }
    })();

    return () => {
      cancelled = true;
      modelRef.current?.destroy();
      modelRef.current = null;
      appRef.current?.destroy(true);
      appRef.current = null;
      loadedRef.current = false;
      setModelReady(false);
    };
  }, []);

  // audioUrl を受け取ったら model.speak() で再生 + リップシンク。
  // model.speak は内部で AudioContext / AnalyserNode を構築し、
  // ライブラリの update サイクル内で LipSync パラメータを更新する。
  useEffect(() => {
    const model = modelRef.current;
    if (!model || !modelReady || !audioUrl) return;

    let cancelled = false;
    model
      .speak(audioUrl, {
        volume: 1.0,
        crossOrigin: 'anonymous',
        onFinish: () => {
          if (!cancelled) onPlaybackEndRef.current?.();
        },
        onError: (e) => {
          if (!cancelled) onPlaybackErrorRef.current?.(e);
        },
      })
      .catch((err) => {
        if (!cancelled) {
          const error = err instanceof Error ? err : new Error(String(err));
          onPlaybackErrorRef.current?.(error);
        }
      });

    return () => {
      cancelled = true;
      model.stopSpeaking();
    };
  }, [audioUrl, modelReady]);

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
      }}
      data-testid="live2d-canvas-container"
    >
      <Box
        ref={containerRef}
        sx={{ width: '100%', height: '100%', canvas: { display: 'block' } }}
      />
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

export function Live2DCanvasFallback({ statusText }: { statusText?: string }) {
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
