'use client';

import { useEffect, useRef } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { HIYORI_MODEL_PATH, CUBISM_PARAMETER_MOUTH_OPEN_Y } from '@/lib/character-renderer';

// coreModel の型定義がサードパーティ側で object に留まっているため、使用するメソッドのみ宣言する
type CubismCoreModel = {
  setParameterValueById(parameterId: string, value: number, weight?: number): void;
};

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
  const modelRef = useRef<import('pixi-live2d-display-lipsyncpatch/cubism4').Live2DModel | null>(
    null
  );
  const loadedRef = useRef(false);

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
