# Core Web Vitals 実測手順

Portal サイトの Core Web Vitals を Lighthouse / PageSpeed Insights で測定する手順をまとめる。

## 測定指標と基準値

| 指標 | Good | Needs Improvement | Poor |
|------|------|-------------------|------|
| LCP（Largest Contentful Paint） | ≤ 2.5s | 2.5s〜4.0s | > 4.0s |
| CLS（Cumulative Layout Shift） | ≤ 0.1 | 0.1〜0.25 | > 0.25 |
| INP（Interaction to Next Paint） | ≤ 200ms | 200ms〜500ms | > 500ms |
| FCP（First Contentful Paint） | ≤ 1.8s | 1.8s〜3.0s | > 3.0s |
| TTFB（Time to First Byte） | ≤ 800ms | 800ms〜1800ms | > 1800ms |

基準値は `src/lib/coreWebVitals.ts` の `CWV_THRESHOLDS` で定数化している。

## 方法 1: PageSpeed Insights（外部サービス、推奨）

1. [PageSpeed Insights](https://pagespeed.web.dev/) にアクセス
2. 測定対象 URL を入力して「分析」

### 測定対象ページ

| ページ | URL |
|--------|-----|
| トップページ | `https://nagiyu.com/` |
| 技術記事一覧 | `https://nagiyu.com/tech` |
| 技術記事詳細（例） | `https://nagiyu.com/tech/{slug}` |
| カテゴリ別ハブ（例） | `https://nagiyu.com/tech/category/{slug}` |
| タグページ（例） | `https://nagiyu.com/tech/tags/{slug}` |
| サービス一覧 | `https://nagiyu.com/services` |
| サービス詳細（例） | `https://nagiyu.com/services/{slug}` |
| About | `https://nagiyu.com/about` |

### 測定のポイント

- **モバイル / デスクトップ両方**で測定すること（Google は主にモバイルを評価基準とする）
- ページがデプロイ済みでないと PSI は測定できない（dev 環境 URL または本番 URL を使用）
- 「フィールドデータ」（実際のユーザーデータ）と「ラボデータ」（シミュレーション）の両方を確認する

## 方法 2: Chrome DevTools Lighthouse（ローカル）

### 前提条件

- dev サーバーが起動していること
- `npm run dev` を実行して `http://localhost:3000` にアクセスできること

### shared libs のビルド（必須）

```bash
npm run build --workspace=@nagiyu/common
npm run build --workspace=@nagiyu/browser
npm run build --workspace=@nagiyu/ui
npm run build --workspace=@nagiyu/nextjs
```

### dev サーバー起動

```bash
cd services/portal/web
npm run dev
```

### Lighthouse 実行

1. Chrome で `http://localhost:3000` を開く
2. DevTools を開く（F12）
3. 「Lighthouse」タブを選択
4. 「モバイル」または「デスクトップ」を選択
5. 「レポートを生成」をクリック

**注意**: ローカルの dev サーバーでは本番環境と差が生じることがある。以下の点に注意：
- `NODE_ENV=production` の場合のみ AdSense スクリプトが読み込まれる
- サーバー応答時間はローカル環境が実際よりも速い場合がある

## 方法 3: Lighthouse CLI

```bash
# Lighthouse CLI のインストール
npm install -g lighthouse

# モバイル測定
lighthouse http://localhost:3000 --preset=perf --form-factor=mobile --output=html --output-path=./lighthouse-mobile.html

# デスクトップ測定
lighthouse http://localhost:3000 --preset=perf --form-factor=desktop --output=html --output-path=./lighthouse-desktop.html
```

## モバイル UX チェックリスト

Lighthouse スコア以外に、以下をマニュアルで確認する：

- [ ] タップ領域が 48px × 48px 以上（Google 推奨）
- [ ] 本文フォントサイズが 14px 以上
- [ ] `<meta name="viewport">` が設定されている（Next.js App Router では自動設定）
- [ ] ズームなしで全コンテンツが閲覧できる
- [ ] 横スクロールが発生しない

## PR Description への記録フォーマット

測定結果を PR の Description に以下のフォーマットで記録する：

```markdown
## Core Web Vitals 測定結果

測定日: YYYY-MM-DD
環境: dev / 本番
測定ツール: PageSpeed Insights / Lighthouse

| ページ | LCP | CLS | INP | FCP | スコア（モバイル）|
|--------|-----|-----|-----|-----|----------|
| トップページ | - | - | - | - | - |
| 技術記事詳細 | - | - | - | - | - |
| ...    | -   | -   | -   | -   | -        |
```

## 関連ファイル

- 基準値定数: `services/portal/web/src/lib/coreWebVitals.ts`
- Issue: #3312（Core Web Vitals / モバイル UX 実測と軽微修正）
