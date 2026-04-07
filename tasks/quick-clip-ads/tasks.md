# さくっとクリップ 広告表示機能 - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/quick-clip-ads/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/quick-clip-ads/requirements.md — 受け入れ条件・ユースケース
    - tasks/quick-clip-ads/external-design.md — SCR-002 の UI 変更設計
    - tasks/quick-clip-ads/design.md — コンポーネント設計・IMA SDK 実装方針
-->

---

## 事前準備（ユーザーが実施 — 実装開始前に完了させること）

以下はエージェントではなく **サービスオーナーが事前に準備する** 作業です。

- [ ] **Google Ad Manager アカウントの作成**（または既存アカウントの確認）
    - 参考: [Google Ad Manager](https://admanager.google.com/)
    - AdSense for Video でも代替可能

- [ ] **広告ユニットの作成と VAST タグ URL の取得**
    - Ad Manager コンソールで「動画広告ユニット」を作成する
    - 広告タグジェネレーターで VAST タグ URL を生成する
    - 生成した URL を後述の GitHub Actions Secrets に登録する

- [ ] **GitHub Actions Variables への登録**
    - `NEXT_PUBLIC_VAST_TAG_URL` は `NEXT_PUBLIC_` プレフィックスのため `next build` 時（Docker ビルド時）に JS バンドルへ焼き込まれる。公開情報のため Secrets ではなく **Variables**（Settings > Secrets and variables > Actions > Variables タブ）として登録する
    - dev 環境用と prod 環境用でそれぞれ広告ユニットを作成し、対応する VAST URL を登録する（環境名は `QUICK_CLIP_VAST_TAG_URL_DEV` / `QUICK_CLIP_VAST_TAG_URL_PROD` など）
    - E2E テスト（ローカル `npm run dev`）は `.env.local` に設定しないことで広告スキップ
    - workflow への反映はエージェントが実施する

- [ ] **テスト用 VAST タグ URL の確認**（開発時の動作確認用）
    - Google が提供するサンプル VAST URL を使って IMA SDK の動作を確認できる
    - 例: `https://pubads.g.doubleclick.net/gampad/ads?iu=/21775744923/external/single_preroll_skippable&sz=640x480&ciu_szs=300x250%2C728x90&gdfp_req=1&output=vast&unviewed_position_start=1&env=vp&impl=s&correlator=` など（Google IMA SDK サンプルを参照）
    - ローカル開発では `.env.local` に設定する（`.env.local` は `.gitignore` 済みのため安全）

- [ ] **E2E テスト・CI 環境への確認**
    - CI および E2E テスト環境では `NEXT_PUBLIC_VAST_TAG_URL` を**設定しない（空）**ことを確認する
    - 設定しない場合は広告がスキップされ、既存テストがそのままパスする

---

## Phase 1: セットアップ・インフラ

### 1-1. `docker-build-with-retry.sh` の汎用化

現状は `APP_VERSION` の有無だけで分岐している。これを廃止し、環境変数 `DOCKER_BUILD_ARGS`（`KEY=VALUE` のスペース区切り）を受け取って `--build-arg` に展開する形に変更する。

- [x] `.github/scripts/docker-build-with-retry.sh` を変更する（依存: なし）
    - `APP_VERSION` を引数 `$3` で受け取る処理を廃止
    - 環境変数 `DOCKER_BUILD_ARGS`（例: `APP_VERSION=1.0.0 NEXT_PUBLIC_VAST_TAG_URL=https://...`）を読み取り、スペース区切りで `--build-arg KEY=VALUE` に展開する処理を追加
    - `DOCKER_BUILD_ARGS` が空の場合は `--build-arg` なしでビルド（後方互換）

```bash
# 変更後のイメージ
build_args_flags=()
if [ -n "${DOCKER_BUILD_ARGS:-}" ]; then
  for arg in ${DOCKER_BUILD_ARGS}; do
    build_args_flags+=(--build-arg "${arg}")
  done
fi

docker build "${build_args_flags[@]}" -t "${IMAGE_TAG}" -f "${DOCKERFILE}" .
```

### 1-2. `build-docker-image` action の変更

- [x] `.github/actions/build-docker-image/action.yml` を変更する（依存: 1-1）
    - `app-version` input を廃止し `build-args` input（複数行テキスト、任意）に変更
    - `build-args` の値を環境変数 `DOCKER_BUILD_ARGS` としてスクリプトに渡す

```yaml
inputs:
  build-args:
    description: 'Build args as KEY=VALUE lines (e.g. APP_VERSION=1.0.0)'
    required: false
    default: ''
```

### 1-3. 既存の呼び出し側の変更

- [x] `docker-build-with-retry.sh` または `build-docker-image` action を呼び出しているすべての workflow を `build-args:` 形式に変更する（依存: 1-2）
    - 対象: quick-clip 以外のサービスも含む全 workflow の `app-version:` 指定箇所

### 1-4. quick-clip 固有の設定

- [x] `services/quick-clip/web/Dockerfile` の `next build` 前に `ARG NEXT_PUBLIC_VAST_TAG_URL` を追加する（依存: なし）
- [x] `.github/workflows/quick-clip-deploy.yml` の Docker ビルドステップで `build-args` に `NEXT_PUBLIC_VAST_TAG_URL=${{ vars.QUICK_CLIP_VAST_TAG_URL_DEV }}` または `_PROD` を環境に応じて渡す（依存: 1-2・1-4）
- [x] `services/quick-clip/web/.env.local.example` に `NEXT_PUBLIC_VAST_TAG_URL=` を追加してコメントで説明する（依存: なし）
- [x] `@types/google.ima` は npm に存在しないため、`services/quick-clip/web/src/types/google.ima.d.ts` としてローカル型宣言ファイルを作成した（依存: なし）

## Phase 2: `VideoAd` コンポーネント実装

- [ ] `services/quick-clip/web/src/app/jobs/[jobId]/VideoAd.tsx` を新規作成する（依存: Phase 1）
    - `VideoAdProps` 型（`onAdFinished: () => void`）の定義
    - `loadImaSdk()` ユーティリティ関数の実装（`useEffect` 内からのみ呼ぶこと。`window.google?.ima` のキャッシュチェックを含む）
    - `useEffect` 内で `NEXT_PUBLIC_VAST_TAG_URL` が空なら即 `onAdFinished()` を呼ぶフォールバック
    - IMA SDK 初期化フロー（`AdDisplayContainer` → `AdsLoader` → `AdsManagerLoadedEvent` → `adsManager.init/start`）
    - 完了イベント（`COMPLETE` / `SKIPPED` / `ALL_ADS_COMPLETED`）で `onAdFinished()` を呼ぶ
    - エラーイベント（`AD_ERROR`：ローダーレベル・マネージャーレベル両方）で `onAdFinished()` を呼ぶ
    - `active` フラグによるべき等な `finish()` 実装
    - アンマウント時に `adsManager.destroy()` でクリーンアップ
    - MUI `Box` を使った 16:9 広告コンテナ UI（`adContainerRef`・`videoRef`）

## Phase 3: `JobPage` への組み込み

- [ ] `services/quick-clip/web/src/app/jobs/[jobId]/page.tsx` を変更する（依存: Phase 2）
    - `adFinished` state（`useState(false)`）を追加
    - `canMoveToHighlights` の条件に `&& adFinished` を追加
    - `VideoAd` のインポートを追加
    - `FAILED` 以外のステータスかつ `!adFinished` のときに `<VideoAd onAdFinished={() => setAdFinished(true)} />` を表示（`PENDING`・`PROCESSING`・`COMPLETED` すべてで広告を継続表示することで、どちらが先に完了しても正しく動作する）

## Phase 4: テスト

- [ ] `services/quick-clip/web/tests/unit/app/jobs/job-page.test.tsx` を変更する（依存: Phase 3）
    - `VideoAd` の `jest.mock` を追加（即座に `onAdFinished()` を呼ぶモック）
    - 既存テスト（COMPLETED でボタン表示）が引き続きパスすることを確認
    - 追加テスト: 広告未完了のとき COMPLETED でもボタンが非表示になることを確認
    - 追加テスト: FAILED のとき `VideoAd` が表示されないことを確認
- [ ] `npm run test` でテストがすべてパスすることを確認（依存: 上記）
- [ ] Lint・型チェックがすべて通過することを確認（依存: Phase 3）

---

## 完了チェック

- [ ] `tasks/quick-clip-ads/requirements.md` の受け入れ条件をすべて満たしている
- [ ] テストカバレッジが低下していないこと（現状基準を維持）
- [ ] Lint・型チェックがすべて通過している
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `docs/services/quick-clip/` の該当ファイルを更新した
- [ ] `tasks/quick-clip-ads/` ディレクトリを削除した
