# 各サービスのワークフロー共通化

## 概要

各サービスの verify ワークフローと deploy ワークフローで、Docker ビルドや Web ビルドの処理が異なっている。
verify が「deploy と同一の手順でビルドできること」を保証するためには、両者で全く同じビルド処理を共有する必要がある。
composite action を用いて同一のビルド処理を verify と deploy の双方から呼び出す構成に変更する。

## 関連情報

- Issue: #2110
- タスクタイプ: プラットフォームタスク

## 現状の問題点

### verify と deploy でビルド処理が異なる

各サービスで verify と deploy の Docker ビルドを比較すると、以下のような差異がある。

**例: `stock-tracker`**

| 項目 | verify | deploy |
|-----|--------|--------|
| Docker ビルドコマンド（Web） | `docker build -t stock-tracker-web-verify-full-test -f services/stock-tracker/web/Dockerfile .` | `docker build --build-arg APP_VERSION="1.0.0" -t "123456789012.dkr.ecr.us-east-1.amazonaws.com/...:abc1234" -f services/stock-tracker/web/Dockerfile .` |
| `--build-arg APP_VERSION` | **なし** | **あり** |
| ECR へのプッシュ | なし | あり |

**例: `codec-converter`、`niconico-mylist-assistant`、`tools`** でも同様の差異が確認できる。

### 問題の本質

- verify で `--build-arg APP_VERSION` を渡していないため、deploy で使用する Dockerfile の `APP_VERSION` 依存部分がビルド検証されていない
- verify と deploy のビルド処理が別々に記述されているため、片方を修正した際にもう片方への反映漏れが発生しやすい
- 結果として、verify を通過しても deploy で初めてビルドエラーが発覚するリスクがある

## 要件

### 機能要件

- FR1: **各サービスの verify と deploy が、同一の composite action を通じて Docker ビルド・Web ビルドを実行すること**
- FR2: verify 時も deploy と同じビルド引数（`--build-arg APP_VERSION` 等）を使用すること
- FR3: deploy 固有の処理（ECR プッシュ、Lambda 更新等）は composite action の外に残す
- FR4: 既存の動作（verify がビルド成功を確認、deploy がビルド＋プッシュ）を維持すること

### 非機能要件

- NFR1: composite action の inputs に適切な説明を付与する
- NFR2: 既存の `docker-build-lock-acquire` / `docker-build-lock-release` との整合性を維持する

## 実装方針

### 基本的なアプローチ

「verify と deploy が同じビルド処理を共有する」ことを最優先とする。
共有対象の処理を composite action として切り出し、verify / deploy の両方から呼び出す。

### 共通化の対象と action 設計

#### 1. Docker ビルド（最優先）

各サービスの Web / Batch それぞれについて、**ビルドのみ**（プッシュを含まない）を行う composite action を作成する。

- action: `.github/actions/build-docker-image/action.yml`
- inputs: `dockerfile`、`image-tag`（ローカルタグ）、`app-version`（オプション）
- 内部で `docker-build-lock-acquire` / `docker-build-lock-release` を呼び出す
- verify では `image-tag` にローカルタグを指定してビルドのみ実施
- deploy では同 action でビルド後、呼び出し元で ECR へのプッシュを行う

この設計により、verify と deploy が**全く同じ Dockerfile・同じ `--build-arg`** でビルドすることが保証される。

#### 2. Web ビルド（Node.js）

各サービスの Web アプリケーション（Next.js）ビルドを composite action として切り出す。

- action: `.github/actions/build-web-app/action.yml`
- inputs: `workspace`（npm workspace 名）、`shared-workspaces`（事前ビルドが必要な共有ライブラリ群）
- verify / deploy の両方から呼び出す

### 対象サービス

以下のサービスで verify と deploy の Docker / Web ビルドが乖離しているため、対応が必要。

| サービス | verify | deploy | 差異の内容 |
|---------|--------|--------|-----------|
| stock-tracker | `stock-tracker-verify.yml` | `stock-tracker-deploy.yml` | `--build-arg APP_VERSION` の有無 |
| codec-converter | `codec-converter-verify.yml` | `codec-converter-deploy.yml` | `--build-arg APP_VERSION` の有無 |
| niconico-mylist-assistant | `niconico-mylist-assistant-verify.yml` | `niconico-mylist-assistant-deploy.yml` | `--build-arg APP_VERSION` の有無 |
| tools | `tools-verify.yml` | `tools-deploy.yml` | `--build-arg APP_VERSION` の有無 |
| share-together | `share-together-verify.yml` | `share-together-deploy.yml` | 要確認 |

### その他の共通化（副次的な効果）

verify / deploy 間の整合性確保を最優先としつつ、以下の処理についてもサービス横断で共通化する。

- Node.js セットアップ + `npm ci`（`.github/actions/setup-node/action.yml`）
- 環境判定ロジック（`.github/actions/setup-environment/action.yml`）

## タスク

### Phase 1: Docker ビルドの verify/deploy 間統一

- [ ] T001: `.github/actions/build-docker-image/action.yml` を作成する（lock 機構を内包、`app-version` input を持つ）
- [ ] T002: `stock-tracker-verify.yml` の docker-build-web / docker-build-batch を `build-docker-image` に置き換え、`app-version` を渡す
- [ ] T003: `stock-tracker-deploy.yml` の Docker ビルド部分を `build-docker-image` に置き換える（プッシュは呼び出し元で継続）
- [ ] T004: `codec-converter` の verify / deploy で同様に書き換える
- [ ] T005: `niconico-mylist-assistant` の verify / deploy で同様に書き換える
- [ ] T006: `tools` の verify / deploy で同様に書き換える
- [ ] T007: `share-together` の verify / deploy の差異を確認し、必要であれば書き換える

### Phase 2: Web ビルドの verify/deploy 間統一

- [ ] T008: `.github/actions/build-web-app/action.yml` を作成する
- [ ] T009: 各サービスの verify / deploy の Web ビルドステップを `build-web-app` に置き換える

### Phase 3: その他の共通化（サービス横断）

- [ ] T010: `.github/actions/setup-node/action.yml` を作成する（Node.js セットアップ + `npm ci`）
- [ ] T011: 全ワークフローの Node.js セットアップを `setup-node` に書き換える
- [ ] T012: `.github/actions/setup-environment/action.yml` を作成する（dev/prod 環境判定）
- [ ] T013: deploy 系ワークフローの環境判定を `setup-environment` に書き換える

## 参考ドキュメント

- `.github/actions/docker-build-lock-acquire/action.yml` - 既存 composite action の実装例
- `.github/actions/docker-build-lock-release/action.yml` - 既存 composite action の実装例
- `.github/scripts/docker-build-lock.sh` - ロックスクリプト
- [GitHub Docs - Creating a composite action](https://docs.github.com/en/actions/creating-actions/creating-a-composite-action)

## 備考・未決定事項

- verify 時の `app-version` は deploy と同様に対象サービスの `package.json` から取得する（両者で取得方法を統一することで、ビルド条件を一致させる）
- `admin-deploy.yml` / `auth-deploy.yml` は構成が他と異なるため（Docker + Amplify 等）、Phase 1 の対象外とし、個別に判断する
- 書き換え時は job 間の `needs` 依存を崩さないよう注意が必要
