import type { Locator, Page } from '@playwright/test';
import type { Scenario, ScenarioContext, ServiceCapture } from './types';

/**
 * portal の撮影シナリオ。画面ごとに、カードで紹介する状態を撮る。
 * 状態を足したら、カードの「画面の見た目」にも同じ名前で足す。
 *
 * portal は全ページを静的に生成し、DB・認証・外部 API を持たない。
 * E2E も実際の記事 (`src/content/tech`) をそのまま表示しているため、撮影も同じ記事で撮る。
 * 記事が増えれば一覧の見た目が変わるので、そのときは撮り直す。
 *
 * 記事が 0 件の一覧は、記事の置き場所を空にしてビルドし直さないと再現できず、
 * 撮影のために記事を動かせないため撮らない。
 */

/** 更新日と関連記事を持つ記事 */
const ARTICLE_SLUG = 'jest-coverage-threshold';
/** ヘッダーの下に隠れないよう、見せたい要素の上に空ける余白 (CSS px) */
const SCROLL_MARGIN = 72;

/** 描画が落ち着くまで待つ。待つ対象のテキストを明示する */
async function ready(page: Page, text: string): Promise<void> {
  await page.getByText(text, { exact: false }).first().waitFor();
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
}

/** 見せたい要素が表示領域の上寄りに来るまでスクロールする。長いページの一部を撮るために使う */
async function scrollTo(page: Page, target: Locator): Promise<void> {
  await target.evaluate((element, margin) => {
    window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - margin);
  }, SCROLL_MARGIN);
}

/** 長いページは全体を撮らず、今の表示領域だけを撮る */
async function shotViewport(ctx: ScenarioContext, state: string): Promise<void> {
  await ctx.shot(state, { viewportOnly: true });
}

const home: Scenario = {
  screen: 'home',
  async run(ctx) {
    const page = await ctx.freshPage();
    await page.goto('/');
    await ready(page, '最新の技術記事');
    await shotViewport(ctx, 'default');

    await scrollTo(page, page.getByRole('heading', { name: '特集記事' }));
    await shotViewport(ctx, 'featured');

    await scrollTo(page, page.getByRole('heading', { name: '最新の技術記事' }));
    await shotViewport(ctx, 'latest');
  },
};

const tech: Scenario = {
  screen: 'tech',
  async run(ctx) {
    const page = await ctx.freshPage();
    await page.goto('/tech');
    await ready(page, '記事一覧');
    await shotViewport(ctx, 'default');
  },
};

const techArticle: Scenario = {
  screen: 'tech-article',
  async run(ctx) {
    const page = await ctx.freshPage();
    await page.goto(`/tech/${ARTICLE_SLUG}`);
    await ready(page, '読了目安');
    await shotViewport(ctx, 'default');

    await scrollTo(page, page.getByRole('heading', { name: '関連記事' }));
    await shotViewport(ctx, 'related');
  },
};

const about: Scenario = {
  screen: 'about',
  async run(ctx) {
    const page = await ctx.freshPage();
    await page.goto('/about');
    await ready(page, 'サイトの目的');
    await shotViewport(ctx, 'default');

    await scrollTo(page, page.getByRole('heading', { name: '運営方針' }));
    await shotViewport(ctx, 'policy');
  },
};

const contact: Scenario = {
  screen: 'contact',
  async run(ctx) {
    const page = await ctx.freshPage();
    await page.goto('/contact');
    await ready(page, 'お問い合わせフォーム');
    await shotViewport(ctx, 'default');

    await scrollTo(page, page.getByRole('heading', { name: '注意事項' }));
    await shotViewport(ctx, 'notes');
  },
};

const legal: Scenario = {
  screen: 'legal',
  async run(ctx) {
    let page = await ctx.freshPage();
    await page.goto('/terms');
    await ready(page, '第1条');
    await shotViewport(ctx, 'terms');

    page = await ctx.freshPage();
    await page.goto('/privacy');
    await ready(page, '第1条');
    await shotViewport(ctx, 'privacy');
  },
};

const notFound: Scenario = {
  screen: 'not-found',
  async run(ctx) {
    // 存在しない記事の URL も、同じ画面になる
    const page = await ctx.freshPage();
    await page.goto('/no-such-page');
    await ready(page, 'ページが見つかりません');
    await shotViewport(ctx, 'default');
  },
};

export const portal: ServiceCapture = {
  service: 'portal',
  // 要件の外部設計はモバイルで 1 カラム、デスクトップで 3 カラムのレイアウトを定めていて、どちらかに絞っていない
  devices: ['mobile', 'desktop'],
  server: {
    cwd: 'services/portal/web',
    build: ['npm', 'run', 'build'],
    command: ['npm', 'run', 'start', '--'],
    port: 3400,
    healthPath: '/api/health',
    requiredBuilds: ['libs/ui/dist', 'libs/nextjs/dist', 'libs/common/dist', 'libs/browser/dist'],
  },
  // 認証もロールもないサービス
  defaultRoles: [],
  fixedTime: '2026-11-11T01:30:00Z',
  scenarios: [home, tech, techArticle, about, contact, legal, notFound],
};
