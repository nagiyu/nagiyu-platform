# 各サービスのワークフロー共通化

## 概要

各ワークフローで重複した処理（Docker ビルド、Node.js セットアップ、共有ライブラリビルド等）を composite action に切り出し、メンテナンス性を向上させる。

## 関連情報

- Issue: #2110
- タスクタイプ: プラットフォームタスク

## 現状の問題点

### ファイル規模

- ワークフローファイル合計: 8,475 行（`wc -l .github/workflows/*.yml` の total 値。コメント行含む）
- 最大ファイル: `stock-tracker-verify.yml`（729 行）、`niconico-mylist-assistant-verify.yml`（705 行）

### 主な重複パターン

| パターン | 出現回数 | 1 回の行数 | 合計削減見込み |
|---------|--------|---------|------------|
| Node.js セットアップ + `npm ci` | 30 回以上 | 8 行 | 240 行以上 |
| 環境判定ロジック（dev/prod 切り替え） | 5 回 | 15 行 | 60 行 |
| 共有ライブラリビルド（common/browser/ui 等） | 20 回以上 | 4〜8 行 | 80 行以上 |
| Docker ビルド・プッシュ（lock 含む） | 13 回 | 25 行 | 325 行 |
| Lambda 関数コード更新 + 完了待機 | 7 回 | 15〜20 行 | 105 行 |
| PR コメントレポート生成 | 6 回 | 40 行 | 240 行 |
| CloudFormation スタック出力取得 | 10 回以上 | 8 行 | 80 行以上 |

削減見込み合計: **1,130 行（約 13%）**

## 要件

### 機能要件

- FR1: 重複している処理を composite action として `.github/actions/` 配下に切り出す
- FR2: 既存のワークフローを新規 composite action を使うよう書き換える
- FR3: 動作が変わらないこと（リファクタリングのみ、機能変更なし）

### 非機能要件

- NFR1: 各 composite action は単独で理解・テスト可能な単位とする
- NFR2: `inputs` / `outputs` に適切な説明を付与する
- NFR3: 既存の `docker-build-lock-acquire` / `docker-build-lock-release` との整合性を維持する

## 実装方針

### 新規 composite action の一覧（優先度順）

#### 優先度高

1. **`setup-node`**
    - Node.js のセットアップ（`actions/setup-node@v4`）と `npm ci` をまとめる
    - 出現数が最多のため、最初に対応する
    - inputs: `node-version`（デフォルト `22`）、`cache-dependency-path`

2. **`setup-environment`**
    - `workflow_dispatch` / ブランチ名に基づく env（dev/prod）と stack-suffix の判定ロジック
    - deploy 系 5 ワークフローで同一コードが重複
    - outputs: `environment`、`stack-suffix`

3. **`build-shared-libs`**
    - 共有ライブラリ（`@nagiyu/common` 等）のビルドをまとめる
    - inputs: `workspaces`（スペース区切りのワークスペース名リスト）

#### 優先度中

4. **`build-and-push-docker`**
    - Dockerfile 指定 → Docker ビルド → ECR プッシュ を一連でまとめる
    - 既存の `docker-build-lock-acquire` / `docker-build-lock-release` を内部で呼び出す
    - inputs: `dockerfile`、`image-uri`、`app-version`、`image-tags`

5. **`update-lambda`**
    - ECR イメージ URI 取得 → `aws lambda update-function-code` → 完了待機 の一連処理
    - inputs: `function-name`、`image-uri`、`region`

6. **`report-pr-result`**
    - 各 job の結果を受け取りテーブル形式の PR コメントを生成する
    - inputs: job result 群（`build`、`test`、`coverage` 等の result 文字列）

#### 優先度低

7. **`get-cfn-output`**
    - CloudFormation スタックの出力値取得の共通化
    - inputs: `stack-name`、`output-key`

### 実装のアプローチ

- 1 action ずつ段階的に実装し、対象ワークフローをその都度書き換える
- 書き換え後は対象ワークフローを手動または CI で動作確認してから次に進む
- `setup-node` から始めることで、全ワークフローの恩恵を早期に得る

## タスク

### Phase 1: 基盤整備

- [ ] T001: `.github/actions/setup-node/action.yml` を作成する
- [ ] T002: 全 verify ワークフローの Node.js セットアップを `setup-node` に書き換える
- [ ] T003: 全 deploy ワークフローの Node.js セットアップを `setup-node` に書き換える

### Phase 2: 環境判定・ライブラリビルド

- [ ] T004: `.github/actions/setup-environment/action.yml` を作成する
- [ ] T005: deploy 系 5 ワークフロー（codec-converter, niconico, share-together, stock-tracker, tools）の環境判定を書き換える（admin / auth は構成が異なるため備考参照）
- [ ] T006: `.github/actions/build-shared-libs/action.yml` を作成する
- [ ] T007: 共有ライブラリビルド箇所を `build-shared-libs` に書き換える

### Phase 3: Docker・Lambda

- [ ] T008: `.github/actions/build-and-push-docker/action.yml` を作成する（内部で既存 lock actions を呼び出す）
- [ ] T009: 各 deploy ワークフローの Docker ビルド処理を `build-and-push-docker` に書き換える
- [ ] T010: `.github/actions/update-lambda/action.yml` を作成する
- [ ] T011: Lambda 更新処理を `update-lambda` に書き換える

### Phase 4: レポート

- [ ] T012: `.github/actions/report-pr-result/action.yml` を作成する
- [ ] T013: 各 verify ワークフローの PR コメント生成を `report-pr-result` に書き換える

### Phase 5: 後処理

- [ ] T014: 低優先度の `get-cfn-output` action の要否を判断し、必要なら実装する
- [ ] T015: 各 composite action の README コメントを整備する

## 参考ドキュメント

- `.github/actions/docker-build-lock-acquire/action.yml` - 既存 composite action の実装例
- `.github/actions/docker-build-lock-release/action.yml` - 既存 composite action の実装例
- `.github/scripts/docker-build-lock.sh` - ロックスクリプト
- [GitHub Docs - Creating a composite action](https://docs.github.com/en/actions/creating-actions/creating-a-composite-action)

## 備考・未決定事項

- `reusable workflow`（`workflow_call`）の利用も検討できるが、ファイル分割が増えるため、まず composite action で統一する方針とする
- 書き換え時は job 間の `needs` 依存を崩さないよう注意が必要
- `admin-deploy.yml` / `auth-deploy.yml` は構成が他と異なるため（単一 ECR）、Phase 3 適用時に個別対応を検討する
