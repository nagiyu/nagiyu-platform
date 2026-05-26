'use client';

import { useEffect, useRef } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { HIYORI_MODEL_PATH, CUBISM_PARAMETER_MOUTH_OPEN_Y } from '@/lib/character-renderer';

// coreModel の型定義がサードパーティ側で object に留まっているため、使用するメソッドのみ宣言する
type CubismCoreModel = {
  setParameterValueById(parameterId: string, value: number, weight?: number): void;
};

export interface Live2DCanvasProps {
  audioLevel: number;
  statusText?: string;
}

/**
 * PixiJS + pixi-live2d-display-lipsyncpatch で桃瀬ひよりを描画するキャンバスコンポーネント。
 *
 * Cubism Core (live2dcubismcore.min.js) は layout.tsx の <Script strategy="beforeInteractive">
 * で事前にロードされ window.Live2DCubismCore として参照可能な状態になっている前提。
 *
 * PixiJS v7 と pixi-live2d-display-lipsyncpatch は browser API を直接使うため
 * SSR 不可。next/dynamic + ssr:false で呼び出し元がラップする。
 */
export default function Live2DCanvas({ audioLevel, statusText }: Live2DCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<import('pixi.js').Application | null>(null);
  const modelRef = useRef<import('pixi-live2d-display-lipsyncpatch').Live2DModel | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || loadedRef.current) return;
    loadedRef.current = true;

    let cancelled = false;

    (async () => {
      const [{ Application, utils }, { Live2DModel }] = await Promise.all([
        import('pixi.js'),
        import('pixi-live2d-display-lipsyncpatch'),
      ]);

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
        const model = await Live2DModel.from(HIYORI_MODEL_PATH, { autoInteract: false });
        if (cancelled) {
          model.destroy();
          return;
        }
        modelRef.current = model;

        // モデルをキャンバスに合わせてスケール・センタリング
        const scaleX = w / model.width;
        const scaleY = h / model.height;
        const scale = Math.min(scaleX, scaleY) * 0.95;
        model.scale.set(scale);
        model.x = (w - model.width * scale) / 2;
        model.y = (h - model.height * scale) / 2;

        app.stage.addChild(model);
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
    };
  }, []);

  // audioLevel → ParamMouthOpenY に反映
  useEffect(() => {
    const model = modelRef.current;
    if (!model) return;
    try {
      (model.internalModel.coreModel as CubismCoreModel).setParameterValueById(
        CUBISM_PARAMETER_MOUTH_OPEN_Y,
        Math.max(0, Math.min(1, audioLevel))
      );
    } catch {
      // Cubism Core が未ロードのタイミングでは無視
    }
  }, [audioLevel]);

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
