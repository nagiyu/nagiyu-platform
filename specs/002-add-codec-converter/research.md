# research.md — Codec Converter（Phase 0）

この文書は `plan.md` の `NEEDS CLARIFICATION` を解決するための調査結果をまとめたものです。各項目は「Decision / Rationale / Alternatives considered」の形式で記載します。

## 1) インフラ IaC ツール

Decision: CloudFormation（既存リポジトリ慣例に従う）。

Rationale:
- リポジトリ内に既存の CloudFormation テンプレートと `aws cloudformation deploy` の手順が多数存在するため、既存運用・デプロイフローに合わせるのが最短で確実。
- `infra/` 配下や `docs/infra` に CloudFormation テンプレートが配置されており、スタック間の Export/Import を利用した設計が既に想定されている。
- Phase 1 では運用整合性を優先し、既存のテンプレートと手順を踏襲する方がチームでの受け入れが容易。

Alternatives considered:
- AWS CDK (TypeScript): 開発者体験やプログラマティックな再利用性の利点がある。将来的な移行候補として記録する。
- Terraform: マルチクラウド対応や宣言的管理の利点があるが、既存の CloudFormation ベース運用との整合性が必要になるため Phase 1 では採用しない。

Note:
- 将来的に CDK へ移行する場合は、まず既存 CloudFormation テンプレートを CDK の `CloudFormation` コンストラクトでラップするか、段階的に移行する計画を作成することを推奨する。

---

## 2) Node / ランタイムのバージョン

Decision: Node.js の最新 LTS（または実装時点で推奨される最新安定版）を採用する。

Rationale:
- 新機能やパフォーマンス改善、安全性の修正が含まれるため、可能な限り最新の安定版を採用する方針とする。
- CI/CD と Lambda のランタイム互換性を確認し、デプロイ時にサポートされているバージョンを使用する運用ルールを定める。

Alternatives considered:
- 固定バージョン（例: Node 18/20）: 再現性は高いが、セキュリティ更新や新機能対応が遅れる可能性がある。運用ポリシーとして必要ならバージョン固定を検討する。

Note:
- 実装リポジトリには `.nvmrc` や `engines` を用いて推奨バージョンを明示し、CI では `node-version` を指定してビルド再現性を確保することを推奨する。

---

## 3) テストスタック

Decision:
- フロントエンドユニット: Jest + React Testing Library
- E2E: Playwright
- API/バックエンド統合: Jest + supertest（APIルートの統合テスト）
- ワーカーのコンテナ統合テスト: Docker を用いたローカル実行（GitHub Actions での container-based test）

Rationale:
- Jest + RTL は Next.js/React の標準的な組み合わせで、高い開発効率を提供する。
- Playwright は E2E の実行安定性が高く、CI でのブラウザテストが容易。
- Worker（FFmpeg）については実行環境がコンテナ内のため、ユニットテストよりもコンテナ統合テストが重要。

Alternatives considered:
- Vitest: 高速だが新規導入コストと既存エコシステム（Jest）のサポートを考慮して今回は Jest を推奨。

---

## 4) FFmpeg のコンテナ戦略

Decision: Batch 実行用のカスタム Docker イメージを用意する（Debian/Ubuntu ベースに必要なライブラリとビルド済み FFmpeg を組み込む）。

Rationale:
- AV1 対応（libaom）、VP9（libvpx）、libx264 などを有効化した FFmpeg が必要で、OS のパッケージだけでは不足する場合があるため、ビルド済みバイナリを含む Dockerfile を作成する方が確実。
- カスタムイメージに Worker スクリプト（S3 からダウンロード、FFmpeg 実行、アップロード、DynamoDB 更新）を含めると運用がシンプルになる。

Alternatives considered:
- 既存の公開 FFmpeg イメージ（例: jrottenberg/ffmpeg）をベースにする: 手軽だが信頼性・セキュリティ確認とライセンス・ビルドオプションの検証が必要。運用で安定するならこちらも選択肢。
- ffmpeg-static npm モジュール: Node.js コンテナで軽く使うには便利だが、大量のエンコードで最適化されたビルドを得るには不向き。

---

## 5) CI / CD

Decision: GitHub Actions を採用。ワークフロー例:
- `lint/test` : PR 時に実行（Jest, ESLint, TypeScript チェック）
- `build/publish` : main/develop マージ時にコンテナをビルドし ECR に push、CDK によるデプロイは手動トリガまたは自動承認ワークフローで実行
- `integration` : イメージを使った統合テスト（worker の短い変換ジョブなど）

Rationale:
- リポジトリが GitHub 上にある想定で、Actions は統合が容易。
- ECR/ECS/AWS への認証を Actions で管理可能。

Alternatives considered:
- Jenkins/GitLab CI: 社内のポリシーがあれば検討だが、まずは GitHub Actions を推奨。

---

## 6) 憲法ファイル（Constitution）の不確定事項

Decision: Phase 0 では憲法ファイルがテンプレートのため、明示されたガイドラインがない点を受け入れつつ、設計上の重要な決定（IaC、テスト、CI、ランタイム）をこの `research.md` に記録することで合意の代替とする。

Rationale:
- プロジェクト進行のために最低限必要な設計決定を先に行う必要がある。憲法の正式な追記はチーム合意が得られ次第、` .specify/memory/constitution.md` を更新する。

Action:
- 憲法の正式化が可能なステークホルダ（リポジトリ管理者）に対して、決定事項を提示して ratify を依頼する。手順は `plan.md` の Constitution Check に記載する。

---

## 7) その他の小さな未解決事項（一覧）

- IaC の最終ツール（CDK を採用予定だが、運用ポリシーで Terraform が必須か要確認） — NEEDS CLARIFICATION
- CI の ECR 認証方式（OIDC or secrets） — 実運用方針で決定予定 — NEEDS CLARIFICATION
- テストの CI 負荷（Playwright を使うかは PR 負荷を見て判断） — 実装時に調整

---

## 結論（短く）

Phase 1 に進めるための技術的決定は上記の通りです。未決（Constitution、IaC 運用ポリシー、CI 認証方式）は `NEEDS CLARIFICATION` として記録しました。次は `data-model.md`（ジョブ / DB スキーマ）と API 契約の作成に進みます。
