# Implementation Plan: [FEATURE]

**Branch**: `002-add-codec-converter` | **Date**: 2025-12-13 | **Spec**: `specs/002-add-codec-converter/spec.md`

## 概要

この計画は `specs/002-add-codec-converter/spec.md` に記載された要件に基づき、Phase 1（MP4 入力、H.264/VP9/AV1 出力、S3 Presigned URL、AWS Batch + FFmpeg、DynamoDB でのジョブ管理）を実装するための具体方針を示します。匿名利用（認証なし）、アップロード上限 500MB、出力保持 24時間などの要件を満たします。

## 技術的方針（Technical Context）

- ランタイム: Node.js（実装時点での最新 LTS または推奨される最新安定版）
- フレームワーク: Next.js（Frontend + API Routes）
- ストレージ: Amazon S3（uploads/, outputs/）、SSE-S3 を有効化
- DB: Amazon DynamoDB（テーブル: `codec-converter-jobs-{env}`、TTL: `expiresAt`）
- 変換処理: AWS Batch（Fargate）でカスタム FFmpeg コンテナを実行
- IaC: CloudFormation（既存リポジトリ慣例に合わせる）
- テスト: ユニット: Jest、E2E: Playwright、API 統合: Jest + supertest、ワーカーはコンテナ統合テスト
- CI: GitHub Actions（ECR へイメージ push、CloudFormation deploy ワークフロー）

制約: Lambda は 15 分制限があるため重い処理は全て Batch に委譲。アップロードは S3 Presigned URL を利用し、フロントエンドで 500MB を超えるファイルは弾く。

## 構成（リポジトリ内配置）

このリポジトリの慣例に合わせ、サービスは `services/` 配下に配置し、共通ライブラリは `libs/`、インフラは `infra/` に配置します。具体的には以下のとおりです。

```text
services/codec-converter/             # Next.js アプリ (フロント + API) — サービス実装
services/codec-converter-worker/      # FFmpeg を含む Batch ワーカーコンテナ — 実行用イメージのソース
infra/codec-converter/                # CloudFormation テンプレート（S3, DynamoDB, Batch, IAM 等）
libs/                                  # 共通ライブラリ（必要に応じて nextjs-common などを追加）
specs/002-add-codec-converter/        # 本ドキュメント群 (spec.md, plan.md, research.md, data-model.md, contracts/)
docs/apps/codec-converter/            # サービス固有の設計／要件ドキュメント（既存）
```

理由: リポジトリのルート `README.md` と `docs/` の構成から、既存プロジェクトは `services/` をアプリケーション格納先としているため、それに揃えます。

## フェーズ 0 / 1 のチェックポイント

- Phase 0: `research.md` による技術決定（完了）
- Phase 1: `data-model.md`, `contracts/openapi.yaml`, `quickstart.md`（作成済み）
- 憲法チェック: `.specify/memory/constitution.md` がテンプレートのため、ガイドラインの明確化が必要（`research.md` に記録済み）

## 次の実装タスク（優先順）

1. `apps/codec-converter` のベース実装: API エンドポイント `POST /api/jobs`, `POST /api/jobs/{jobId}/submit`, `GET /api/jobs/{jobId}`, `GET /api/jobs/{jobId}/download` を作成。
2. `services/codec-converter-worker` の Dockerfile とエントリスクリプト（S3 からダウンロード、FFmpeg 実行、S3 へアップロード、DynamoDB 更新）を実装。
3. `infra/codec-converter` に CloudFormation テンプレートのスケルトンを追加（S3 バケット、DynamoDB、Batch 設定、IAM ロール、ECR リポジトリ）。
4. CI ワークフロー: コンテナビルド → ECR push → CloudFormation deploy の雛形を GitHub Actions に追加。

## 複雑度／例外管理

- 現状、憲法でのガードレールが未定義なため、重要な設計変更は `research.md` に追記して合意を取り、必要なら `.specify/memory/constitution.md` を更新するワークフローを作成する。

## 参考 / 参照

- 仕様: `specs/002-add-codec-converter/spec.md`
- 研究結果: `specs/002-add-codec-converter/research.md`
- データモデル: `specs/002-add-codec-converter/data-model.md`
- API 契約: `specs/002-add-codec-converter/contracts/openapi.yaml`
