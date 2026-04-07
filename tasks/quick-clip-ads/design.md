<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/services/quick-clip/architecture.md に ADR として抽出し、
    tasks/quick-clip-ads/ ディレクトリごと削除します。

    入力: tasks/quick-clip-ads/requirements.md
    次に作成するドキュメント: tasks/quick-clip-ads/tasks.md
-->

# さくっとクリップ 広告表示機能 - 技術設計

---

## API 仕様

API の追加・変更はなし。広告機能はすべてフロントエンド（クライアントサイド）で完結する。

---

## 環境変数

| 変数名 | 説明 | 必須 |
|--------|------|------|
| `NEXT_PUBLIC_VAST_TAG_URL` | Google Ad Manager の VAST タグ URL。空または未設定の場合、広告機能は無効化される | 本番のみ |

**管理方法**: `NEXT_PUBLIC_` プレフィックスのため `next build` 実行時（Docker ビルド時）に JS バンドルへ**ビルド時定数として焼き込まれる**。Lambda のランタイムに注入する Secrets Manager では間に合わない。公開情報のため GitHub Actions の **Variables**（非シークレット）として環境ごとに登録し、`docker build --build-arg` で渡す。

`docker-build-with-retry.sh` は環境変数 `DOCKER_BUILD_ARGS`（`KEY=VALUE` スペース区切り）を受け取って `--build-arg` に展開する汎用化を行う（`tasks.md` Phase 1 参照）。

**環境ごとの値**:

| 環境 | 値 | 広告ユニット |
|------|----|----|
| dev AWS | `${{ vars.QUICK_CLIP_VAST_TAG_URL_DEV }}` | dev 用広告ユニット |
| prod AWS | `${{ vars.QUICK_CLIP_VAST_TAG_URL_PROD }}` | prod 用広告ユニット |
| E2E（ローカル） | 未設定（`.env.local` に書かない） | — |

**空のときの挙動**: `VideoAd` コンポーネントは即座に `onAdFinished()` を呼び出し、広告完了済みとして扱う。
これにより `NEXT_PUBLIC_VAST_TAG_URL` 未設定の環境（E2E・ローカル開発）では従来通り「COMPLETED になり次第ボタン表示」の動作を維持する。

---

## コンポーネント設計

### パッケージ責務分担

| パッケージ | 変更 | 内容 |
|----------|------|------|
| `quick-clip/web` | 変更あり | `VideoAd` コンポーネント追加・`JobPage` 変更 |
| `quick-clip/core` | 変更なし | — |
| `quick-clip/batch` | 変更なし | — |
| `quick-clip/lambda` | 変更なし | — |

### 実装モジュール一覧

**web（追加・変更）**

| モジュール | パス | 役割 | 変更種別 |
|----------|------|------|---------|
| `VideoAd` | `web/src/app/jobs/[jobId]/VideoAd.tsx` | Google IMA SDK を使って動画広告を再生するクライアントコンポーネント | **新規** |
| `JobPage` | `web/src/app/jobs/[jobId]/page.tsx` | `VideoAd` を組み込み・`canMoveToHighlights` 条件を変更 | **変更** |

---

## `VideoAd` コンポーネント仕様

### 責務

- Google IMA SDK を CDN から動的ロードする
- `NEXT_PUBLIC_VAST_TAG_URL` が空のとき即座に `onAdFinished()` を呼ぶ（フォールバック）
- 広告再生完了（COMPLETE / SKIPPED / ALL_ADS_COMPLETED）時に `onAdFinished()` を呼ぶ
- 広告エラー（AD_ERROR）・SDK ロード失敗時も `onAdFinished()` を呼ぶ（フォールバック）
- アンマウント時に `adsManager.destroy()` でリソースを解放する

### Props

```typescript
export type VideoAdProps = {
  /** 広告完了（またはフォールバック）時に呼ばれるコールバック */
  onAdFinished: () => void;
};
```

### IMA SDK のロード方法

**重要**: Google IMA SDK は npm パッケージとして提供されていない。Google 公式の方法は CDN からスクリプトを読み込む方法のみ。

```
https://imasdk.googleapis.com/js/sdkloader/ima3.js
```

自前の `loadImaSdk()` ユーティリティをコンポーネント内に実装する:

```typescript
const IMA_SDK_URL = 'https://imasdk.googleapis.com/js/sdkloader/ima3.js';

const loadImaSdk = (): Promise<typeof google.ima> =>
  new Promise((resolve, reject) => {
    // 既にロード済みの場合はキャッシュを返す
    if (typeof window !== 'undefined' && window.google?.ima) {
      resolve(window.google.ima);
      return;
    }
    const script = document.createElement('script');
    script.src = IMA_SDK_URL;
    script.async = true;
    script.onload = () => resolve(window.google.ima);
    script.onerror = reject;
    document.body.appendChild(script);
  });
```

### 型定義

`@types/google.ima` を `devDependencies` に追加することで `google.ima` の型が利用可能になる。
`window.google.ima` へのアクセスには型アサーションが必要な場合がある。

```json
// package.json (devDependencies)
"@types/google.ima": "^3.x"
```

### 広告コンテナの DOM 構造

IMA SDK は `AdDisplayContainer` に渡した `div` 要素の内部に `iframe` を挿入する。
`video` 要素は IMA SDK が広告動画の再生に使用するコンテンツ動画要素として必要。

```tsx
return (
  <Box sx={{ position: 'relative', width: 640, maxWidth: '100%', aspectRatio: '16/9', bgcolor: 'black', mx: 'auto' }}>
    {/* IMA SDK がこの div に iframe を挿入する */}
    <Box ref={adContainerRef} sx={{ position: 'absolute', inset: 0, zIndex: 1 }} />
    {/* IMA SDK がコンテンツ動画として使用する video 要素 */}
    <Box component="video" ref={videoRef} sx={{ width: '100%', height: '100%', display: 'block' }} muted playsInline />
  </Box>
);
```

### IMA SDK 初期化フロー

```
loadImaSdk()
  └─ new AdDisplayContainer(adContainerDiv, videoElement)
       └─ displayContainer.initialize()
            └─ new AdsLoader(displayContainer)
                 ├─ ADS_MANAGER_LOADED イベント
                 │    └─ adsManager = event.getAdsManager(videoElement)
                 │         ├─ addEventListener(COMPLETE, finish)
                 │         ├─ addEventListener(SKIPPED, finish)
                 │         ├─ addEventListener(ALL_ADS_COMPLETED, finish)
                 │         ├─ addEventListener(AD_ERROR, finish)
                 │         └─ adsManager.init(640, 360, ViewMode.NORMAL)
                 │              └─ adsManager.start()
                 │
                 └─ AD_ERROR イベント（ローダーレベル・no fill など）
                      └─ finish()
```

### `finish()` のべき等性

```typescript
let active = true;
const finish = () => {
  if (active) {
    active = false;        // 二重呼び出しを防ぐ
    onAdFinishedRef.current();
  }
};
```

アンマウント時にも `active = false` にセットし、クリーンアップ後の呼び出しを防ぐ。

---

## `page.tsx` の変更仕様

### 追加する state

```typescript
const [adFinished, setAdFinished] = useState(false);
```

### `canMoveToHighlights` の変更

```typescript
// 変更前
const canMoveToHighlights = useMemo(() => job?.status === 'COMPLETED', [job?.status]);

// 変更後
const canMoveToHighlights = useMemo(
  () => job?.status === 'COMPLETED' && adFinished,
  [job?.status, adFinished],
);
```

### JSX に追加する `VideoAd` 表示条件

```tsx
// PENDING または PROCESSING かつ広告未完了のときのみ表示
{(job?.status === 'PENDING' || job?.status === 'PROCESSING') && !adFinished && (
  <VideoAd onAdFinished={() => setAdFinished(true)} />
)}

// COMPLETED かつ広告未完了の場合も継続して広告を表示（処理が先に終わったケース）
{job?.status === 'COMPLETED' && !adFinished && (
  <VideoAd onAdFinished={() => setAdFinished(true)} />
)}
```

> **注意**: 上記 2 つの条件は `!adFinished` で共通しているため、コードでは `job?.status !== 'FAILED' && !adFinished` のようにまとめることも可能。実装時に読みやすい形に整理すること。

### `VideoAd` の二重マウントを防ぐ

ポーリングで `PENDING → PROCESSING → COMPLETED` と状態が変わっても、`VideoAd` は一度マウントされたら `adFinished` になるまでアンマウントされない。上記の条件式はこれを満たしている（`PENDING` でも `COMPLETED` でも `!adFinished` なら表示）。

---

## テスト設計

### ユニットテスト（`tests/unit/app/jobs/job-page.test.tsx`）

`VideoAd` を jest.mock してテストから切り離す。

```typescript
import React from 'react';

// VideoAd をモック化：即座に onAdFinished を呼ぶ（デフォルト動作）
jest.mock('@/app/jobs/[jobId]/VideoAd', () => ({
  VideoAd: ({ onAdFinished }: { onAdFinished: () => void }) => {
    React.useEffect(() => { onAdFinished(); }, [onAdFinished]);
    return null;
  },
}));
```

**既存テスト**: `VideoAd` が即 `onAdFinished` を呼ぶことで `adFinished = true` となり、COMPLETED でボタンが表示される既存テストがパスし続ける。

**追加すべきテストケース**:

```typescript
it('広告完了前は COMPLETED でもボタンを表示しない', async () => {
  // VideoAd が onAdFinished を呼ばないモック
  jest.mock('@/app/jobs/[jobId]/VideoAd', () => ({
    VideoAd: () => <div data-testid="video-ad" />,
  }));
  // fetch モックで COMPLETED を返す
  // ボタンが表示されないことをアサート
});

it('FAILED 状態では VideoAd を表示しない', async () => {
  // fetch モックで FAILED を返す
  // data-testid="video-ad" が存在しないことをアサート
});
```

### E2E テスト（`tests/e2e/job-and-highlights-page.spec.ts`）

**変更なし**。

E2E テスト環境では `NEXT_PUBLIC_VAST_TAG_URL` を設定しない（空）ことで広告をスキップする。
`VideoAd` は即 `onAdFinished()` を呼ぶため、COMPLETED でボタンが表示され既存テストがそのままパスする。

Playwright の設定（`playwright.config.ts`）や CI 環境変数で `NEXT_PUBLIC_VAST_TAG_URL` が未設定であることを確認すること。

---

## 実装上の注意点

### 依存関係・前提条件

- `NEXT_PUBLIC_VAST_TAG_URL` の本番 VAST タグ URL は Google Ad Manager または AdSense for Video で発行する（**ユーザーが事前に準備する**）
- `@types/google.ima` は型チェック専用の devDependency。ランタイムには不要

### セキュリティ考慮事項

- `NEXT_PUBLIC_VAST_TAG_URL` は `NEXT_PUBLIC_` プレフィックスのためクライアントに公開される。VAST タグ URL 自体は公開情報のため問題なし
- IMA SDK は Google の CDN から読み込まれる。CSP（Content Security Policy）を設定している場合、`imasdk.googleapis.com` および `*.googlesyndication.com` 等を許可リストに追加する必要がある

### `next/script` を使わない理由

IMA SDK は `useEffect` 内（ブラウザ環境）でのみ動作させる必要があり、SSR で実行されると `document` が存在せずエラーになる。
`next/script` の `strategy="lazyOnload"` ではコンポーネントのアンマウント時のクリーンアップが難しいため、自前の動的スクリプト挿入を採用する。

---

## docs/ への移行メモ

- [ ] `docs/services/quick-clip/requirements.md` に統合すること：
    - 2. 追加ユースケース（UC-004）
    - 3. 追加機能要件（F-011〜F-013）
    - 4. 非機能要件への追記（広告エラー耐性・環境変数制御）
- [ ] `docs/services/quick-clip/external-design.md` に統合すること：
    - SCR-002 の主要 UI 要素・インタラクション・表示条件に広告関連の差分を追記
- [ ] `docs/services/quick-clip/architecture.md` に ADR として追記すること：
    - Google IMA SDK の採用理由（npm 非提供・CDN ロードが公式方法）
    - `NEXT_PUBLIC_VAST_TAG_URL` による広告有効・無効の切り替え方針
    - エラー時フォールバック設計の意図
