import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { DEVICES, type DeviceId, imageFileName } from '../src/spec-screenshot';
import type { ScenarioContext, ServiceCapture, ShotOptions } from './types';

/** サービスがテスト用ロールを受け取るヘッダー。E2E のフィクスチャと同じ */
const ROLES_HEADER = 'x-test-user-roles';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_SETTLE_MS = 300;

/**
 * 毎回同じ画像にするための見た目の固定。
 * - アニメーションと遷移を止め、入力欄のカーソル点滅を消す
 * - 開発サーバーが画面の隅に重ねる開発用の表示を隠す
 */
const FREEZE_CSS = `
*, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
}
nextjs-portal { display: none !important; }
`;

export interface CreatedScenarioContext {
  ctx: ScenarioContext;
  close(): Promise<void>;
}

interface Options {
  browser: Browser;
  config: ServiceCapture;
  screen: string;
  device: DeviceId;
  baseUrl: string;
  outDir: string;
  onWrite(fileName: string): void;
}

/** 1 つの撮影 (画面 × 端末) 用に、ブラウザのコンテキストとシナリオ向けの操作を用意する。 */
export async function createScenarioContext(options: Options): Promise<CreatedScenarioContext> {
  const { browser, config, screen, device, baseUrl, outDir, onWrite } = options;
  const spec = DEVICES[device];
  let browserContext: BrowserContext | undefined;
  let currentPage: Page | undefined;

  async function newBrowserContext(roles: string[]): Promise<BrowserContext> {
    await browserContext?.close();
    const created = await browser.newContext({
      baseURL: baseUrl,
      viewport: { width: spec.width, height: spec.height },
      deviceScaleFactor: spec.deviceScaleFactor,
      isMobile: spec.isMobile,
      hasTouch: spec.isMobile,
      locale: 'ja-JP',
      timezoneId: 'Asia/Tokyo',
      colorScheme: 'light',
      reducedMotion: 'reduce',
      // 実際の Service Worker が通信を仲介すると、通信の差し替えが効かなくなる
      serviceWorkers: 'block',
      // ロールを持たないサービスでは、ヘッダーを付けない (外部 URL への通信に余計な事前確認を増やさないため)
      extraHTTPHeaders: roles.length > 0 ? { [ROLES_HEADER]: roles.join(',') } : {},
    });
    created.setDefaultTimeout(DEFAULT_TIMEOUT_MS);
    created.setDefaultNavigationTimeout(DEFAULT_TIMEOUT_MS);
    browserContext = created;
    return created;
  }

  async function freshPage(opts: { roles?: string[] } = {}): Promise<Page> {
    const created = await newBrowserContext(opts.roles ?? config.defaultRoles);
    const page = await created.newPage();
    // 開始時刻だけを固定し、その後は実時間で進める。時刻を止めると、チャートの描画アニメーションが進まず空のまま撮れる
    await page.clock.install({ time: new Date(config.fixedTime) });
    await page.addInitScript((css: string) => {
      const apply = () => {
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
      };
      if (document.head) apply();
      else document.addEventListener('DOMContentLoaded', apply, { once: true });
    }, FREEZE_CSS);
    currentPage = page;
    return page;
  }

  async function resetData(seed?: unknown): Promise<void> {
    const request = (currentPage ?? (await freshPage())).request;
    if (config.resetData) {
      await config.resetData(request, baseUrl, seed ?? {});
      return;
    }
    const response = await request.post(new URL('/api/test/reset', baseUrl).toString(), {
      data: seed ?? {},
    });
    if (!response.ok()) {
      throw new Error(`データの初期化に失敗しました: ${response.status()}`);
    }
  }

  async function shot(state: string, shotOptions: ShotOptions = {}): Promise<void> {
    const page = currentPage;
    if (!page) throw new Error('ページがありません');
    const fileName = imageFileName(screen, state, device);
    onWrite(fileName);
    // 入力欄のフォーカスの枠が、直前の操作によって写り込むのを防ぐ
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(shotOptions.settleMs ?? DEFAULT_SETTLE_MS);
    mkdirSync(outDir, { recursive: true });
    const path = resolve(outDir, fileName);

    if (shotOptions.around) {
      const box = await shotOptions.around.boundingBox();
      if (!box) throw new Error(`撮る範囲が見つかりません: ${fileName}`);
      const padding = shotOptions.padding ?? 16;
      const viewport = page.viewportSize() ?? { width: spec.width, height: spec.height };
      const x = Math.max(0, box.x - padding);
      const y = Math.max(0, box.y - padding);
      await page.screenshot({
        path,
        clip: {
          x,
          y,
          width: Math.min(viewport.width, box.x + box.width + padding) - x,
          height: Math.min(viewport.height, box.y + box.height + padding) - y,
        },
      });
      return;
    }
    await page.screenshot({ path, fullPage: !shotOptions.viewportOnly });
  }

  const ctx: ScenarioContext = {
    device,
    baseUrl,
    get page(): Page {
      if (!currentPage) throw new Error('freshPage を先に呼んでください');
      return currentPage;
    },
    freshPage,
    resetData,
    shot,
  };
  await freshPage();

  return {
    ctx,
    close: async () => {
      await browserContext?.close();
    },
  };
}
