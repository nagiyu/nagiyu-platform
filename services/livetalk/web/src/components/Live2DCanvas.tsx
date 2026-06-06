'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import type { LifecycleState } from '@nagiyu/livetalk-core';
import { getCharacterRenderProfile } from '@/lib/characters/render-profiles';

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

type Live2DModelInstance = import('pixi-live2d-display-lipsyncpatch/cubism4').Live2DModel;

/**
 * 上半身フォーカスのレイアウト。
 * - anchor Y = 0.3: 顔〜胸が基準点（= canvas 中央）になる
 * - scale: 縦は 95% × 1.5 倍、横は 140% を上限とした小さい方
 *
 * 注意: model.width / model.height は PIXI Container の getter で `scale * localBounds`
 * を返すため、現在の scale 適用後の値になる。リサイズの度にそれを基準に再計算すると
 * 倍率が暴走するため、layout transform 適用後の原寸固定値である
 * `internalModel.width / height` を使う。
 */
function layoutModel(model: Live2DModelInstance, w: number, h: number): void {
  const modelWidth = model.internalModel.width;
  const modelHeight = model.internalModel.height;
  model.anchor.set(0.5, 0.3);
  const scaleByHeight = (h * 0.95 * 1.5) / modelHeight;
  const scaleByWidth = (w * 1.4) / modelWidth;
  const scale = Math.min(scaleByHeight, scaleByWidth);
  model.scale.set(scale);
  model.x = w / 2;
  model.y = h / 2;
}

export interface Live2DCanvasProps {
  /**
   * 表示するキャラクターの ID。省略時はレジストリの DEFAULT_CHARACTER_ID を使用する。
   * 現在は単一キャラ運用のため、characterId 変更時の再ロードには対応していない。
   */
  characterId?: string;
  /**
   * 再生対象の AudioBuffer。null または undefined のときは再生しない。
   *
   * iOS Safari の HTMLAudioElement autoplay 制約（transient activation token を
   * play() ごとに消費する仕様）を回避するため、HTMLAudio + model.speak() ではなく
   * Web Audio API の AudioBufferSourceNode を直接使う。
   */
  audioBuffer?: AudioBuffer | null;
  /**
   * 再生に使う AudioContext。親側で user gesture 中に resume 済みである前提。
   * audioBuffer が指定されているのに audioContext が null の場合は再生しない。
   */
  audioContext?: AudioContext | null;
  statusText?: string;
  /**
   * 生活サイクル状態。sleeping 時に目パラメータを半開きに固定する。
   * idle モーションのまばたきが毎フレーム上書きするため、ticker.add で毎フレーム強制セットする。
   */
  lifecycleState?: LifecycleState;
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
 * audioBuffer + audioContext を受け取ると、Web Audio API（AudioBufferSourceNode +
 * AnalyserNode）で再生し、AnalyserNode を motionManager.currentAnalyzer に差し込んで
 * ライブラリの既存リップシンク駆動ループ（ParamMouthOpenY を毎フレーム更新する）を
 * そのまま活用する。
 *
 * iOS Safari の HTMLAudioElement.play() autoplay 制約を回避するために model.speak() は
 * 使わない。AudioContext を user gesture 中に resume してさえいれば、Web Audio 経由の
 * playback は transient activation token を消費しないため何回でも再生できる。
 */
export default function Live2DCanvas({
  characterId,
  audioBuffer,
  audioContext,
  statusText,
  lifecycleState,
  onPlaybackEnd,
  onPlaybackError,
}: Live2DCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<import('pixi.js').Application | null>(null);
  const modelRef = useRef<Live2DModelInstance | null>(null);
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

  // lifecycleState を ref でも保持し、ticker callback 内で最新値を参照できるようにする
  const lifecycleStateRef = useRef(lifecycleState);
  useEffect(() => {
    lifecycleStateRef.current = lifecycleState;
  }, [lifecycleState]);

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
        const renderProfile = getCharacterRenderProfile(characterId);
        const model = await Live2DModel.from(renderProfile.modelPath, {
          autoInteract: false,
          // PIXI Application のティッカーを渡してアイドルモーション・呼吸・まばたきを駆動する
          ticker: app.ticker,
        });
        if (cancelled) {
          model.destroy();
          return;
        }
        modelRef.current = model;

        layoutModel(model, w, h);
        app.stage.addChild(model);
        setModelReady(true);
      } catch (err) {
        console.error('[Live2DCanvas] モデルのロードに失敗しました', err);
      }
    })();

    // Container サイズ変化（画面回転・レスポンシブレイアウト・メッセージ追加による
    // flex 再分配など）を観測して PIXI canvas とモデルを再レイアウトする。
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width === 0 || height === 0) return;

      appRef.current?.renderer.resize(width, height);
      if (modelRef.current) {
        layoutModel(modelRef.current, width, height);
      }
    });
    observer.observe(containerRef.current);

    return () => {
      cancelled = true;
      observer.disconnect();
      modelRef.current?.destroy();
      modelRef.current = null;
      appRef.current?.destroy(true);
      appRef.current = null;
      loadedRef.current = false;
      setModelReady(false);
    };
    // characterId は単一キャラ運用前提でマウント時に一度だけ解決する（変更時の再ロードは未対応）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // audioBuffer + audioContext を受け取ったら Web Audio で再生し、AnalyserNode を
  // モデルの motionManager に差し込むことで、ライブラリ既存のリップシンク駆動ループ
  // （毎フレーム ParamMouthOpenY を更新）をそのまま活用する。
  useEffect(() => {
    const model = modelRef.current;
    if (!model || !modelReady || !audioBuffer || !audioContext) return;

    let cancelled = false;
    let source: AudioBufferSourceNode | null = null;
    let analyser: AnalyserNode | null = null;

    // 型情報がない internal API を扱うための narrowing
    const motionManager = (
      model.internalModel as unknown as {
        motionManager: {
          currentAudio?: { ended: boolean } | undefined;
          currentAnalyzer?: AnalyserNode | undefined;
          currentContext?: AudioContext | undefined;
        };
      }
    ).motionManager;

    try {
      source = audioContext.createBufferSource();
      source.buffer = audioBuffer;

      analyser = audioContext.createAnalyser();
      // SoundManager.addAnalyzer と同じ設定（ライブラリの analyze 関数が前提とする値）
      analyser.fftSize = 256;
      analyser.minDecibels = -90;
      analyser.maxDecibels = -10;
      analyser.smoothingTimeConstant = 0.85;

      source.connect(analyser);
      analyser.connect(audioContext.destination);

      // ライブラリ内部のリップシンク駆動ループに自前 AnalyserNode を hijack 注入。
      // updateParameters 内で `if (this.lipSync && motionManager.currentAudio)` を
      // 通過させるため、currentAudio には truthy なオブジェクトを置く。
      motionManager.currentAudio = { ended: false };
      motionManager.currentAnalyzer = analyser;
      motionManager.currentContext = audioContext;

      source.onended = () => {
        if (cancelled) return;
        motionManager.currentAudio = undefined;
        motionManager.currentAnalyzer = undefined;
        motionManager.currentContext = undefined;
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
      analyser?.disconnect();
      // 自前で差し込んだ analyser だった場合のみクリア（並走更新で別 useEffect 由来の
      // analyser に置き換わっていたら触らない）
      if (motionManager.currentAnalyzer === analyser) {
        motionManager.currentAudio = undefined;
        motionManager.currentAnalyzer = undefined;
        motionManager.currentContext = undefined;
      }
    };
  }, [audioBuffer, audioContext, modelReady]);

  // sleeping 状態のとき、目を半開き（0.3）にしつつ、たまにゆっくり瞬きさせる。
  //
  // ライブラリの内部モデル更新は毎フレーム以下の順序で走る
  // （pixi-live2d-display-lipsyncpatch / fork 元 pixi-live2d-display）:
  //   1. emit('beforeMotionUpdate')
  //   2. motionManager.update()      … idle モーション再生
  //   3. emit('afterMotionUpdate')   … 割り込み可能なフック
  //   4. eyeBlink.updateParameters() … 自動まばたきが目を上書き（開き直す）
  //   5. lipSync / expression / breath
  //   6. coreModel 確定・描画
  //
  // 4 の eyeBlink は 3 の afterMotionUpdate より後に走るため、afterMotionUpdate で
  // 目を抑えても直後に開き直されてしまう（順序依存で半目が維持できない）。
  // そこで eyeBlink を無効化（#3334 で安定実績のある方式）して 3 を最終決定とし、
  // 瞬き自体は自前で駆動する。
  //
  // 自前瞬き: 半開き 0.3 をベースに、ランダムな間隔（3〜6 秒）で 1 回、約 140ms かけて
  // 0.3 → 0 → 0.3 と閉じて開く三角波を重ねる。eyeBlink を切っているので
  // afterMotionUpdate の書き込みが確定し、待機中・発話中とも安定して反映される。
  useEffect(() => {
    const model = modelRef.current;
    if (!model || !modelReady) return;

    if (lifecycleState !== 'sleeping') return;

    const EYE_MAX = 0.3;
    const BLINK_DURATION_MS = 140;
    const BLINK_INTERVAL_MIN_MS = 3000;
    const BLINK_INTERVAL_RANGE_MS = 3000;

    const internalModel = model.internalModel as unknown as {
      coreModel?: { setParameterValueById?: (id: string, value: number) => void };
      eyeBlink?: unknown;
      on?: (event: string, handler: () => void) => void;
      off?: (event: string, handler: () => void) => void;
    };

    // 三角波で瞬きの開き値（0〜0.3）を計算する。瞬き窓の外は 0.3（半目）。
    let blinkStart = -Infinity;
    let nextBlinkAt =
      performance.now() + BLINK_INTERVAL_MIN_MS + Math.random() * BLINK_INTERVAL_RANGE_MS;

    const computeEyeOpen = (now: number): number => {
      if (now >= nextBlinkAt && now > blinkStart + BLINK_DURATION_MS) {
        blinkStart = now;
        nextBlinkAt = now + BLINK_INTERVAL_MIN_MS + Math.random() * BLINK_INTERVAL_RANGE_MS;
      }
      const t = now - blinkStart;
      if (t >= 0 && t < BLINK_DURATION_MS) {
        const half = BLINK_DURATION_MS / 2;
        // 0 → 1 → 0（閉じ具合）。half で最も閉じる
        const closeRatio = t < half ? t / half : 1 - (t - half) / half;
        return EYE_MAX * (1 - closeRatio);
      }
      return EYE_MAX;
    };

    const renderProfile = getCharacterRenderProfile(characterId);
    const applyEyes = () => {
      if (lifecycleStateRef.current !== 'sleeping') return;
      try {
        const value = computeEyeOpen(performance.now());
        internalModel.coreModel?.setParameterValueById?.(
          renderProfile.cubismParams.eyeLOpen,
          value
        );
        internalModel.coreModel?.setParameterValueById?.(
          renderProfile.cubismParams.eyeROpen,
          value
        );
      } catch {
        // 型情報がない internal API のため best-effort
      }
    };

    // 自動まばたき（eyeBlink.updateParameters）が afterMotionUpdate 直後に目を
    // 開き直すため、sleeping 中だけ無効化し、cleanup で元の参照に復元する。
    const savedEyeBlink = internalModel.eyeBlink;
    internalModel.eyeBlink = undefined;

    internalModel.on?.('afterMotionUpdate', applyEyes);

    return () => {
      internalModel.off?.('afterMotionUpdate', applyEyes);
      internalModel.eyeBlink = savedEyeBlink;
    };
    // characterId は単一キャラ運用前提で固定参照とする（変更時の再適用は未対応）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lifecycleState, modelReady]);

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
        // ResizeObserver の追従が一瞬遅れても canvas が下にはみ出してメッセージ欄に
        // 重ならないようにするセーフティネット
        overflow: 'hidden',
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
