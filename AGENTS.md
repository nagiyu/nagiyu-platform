# AGENTS.md - nagiyu-platform エージェント共通指示

本ファイルはリポジトリで動作するすべての AI エージェント（Claude・Codex 等）が実行前に読み込む共通指示です。

---

## 言語

**MUST: すべての出力（コメント・Issue 報告・PR 説明等）は日本語で記述すること**

- コードスニペット・エラーメッセージ内の英語はそのまま保持する
- TypeScript / Next.js / React などの技術用語は英語のまま使用する

---

## リポジトリ概要

- **構成**: AWS 上のモノレポ（npm workspaces）
- **技術スタック**: Next.js + TypeScript + Material-UI + Jest + Playwright
- **インフラ**: AWS CDK（CloudFormation / CloudFront / Lambda / ECR）

### ディレクトリ構成

```
libs/
├── common/   # フレームワーク非依存（外部依存なし）
├── browser/  # ブラウザ API（Clipboard、localStorage 等）
├── ui/       # Next.js + Material-UI
├── react/    # React hooks 等
├── nextjs/   # Next.js ユーティリティ
└── aws/      # AWS SDK ユーティリティ

services/     # 各アプリケーション
infra/        # CDK インフラ定義
docs/         # 永続ドキュメント
tasks/        # 開発時一時ドキュメント（完了後に削除）
```

**ライブラリ依存の一方向性**: `ui → browser → common`（循環依存禁止）

---

## コーディング規約

詳細: `docs/development/rules.md`

### MUST

- TypeScript strict mode 必須
- テストカバレッジ 80% 以上（Jest `coverageThreshold` で自動失敗）
- エラーメッセージは日本語 + 定数化（`ERROR_MESSAGES` オブジェクト）
- UI 層（`components/`, `app/`）とビジネスロジック（`lib/`）を分離
- ライブラリ依存の一方向性を保つ（`ui → browser → common`）

### MUST NOT

- ライブラリ内でパスエイリアス（`@/`）を使用しない
- `dangerouslySetInnerHTML` を直接使用しない（DOMPurify 経由のみ）

---

## テスト要件

詳細: `docs/development/testing.md`

- テストファイルは `tests/` 配下に配置（`src/` と分離）
- 副作用がある処理のみモック化、純粋関数はそのまま実行
- E2E: Fast CI は `chromium-mobile` のみ、Full CI は全デバイス

---

## ブランチ戦略

詳細: `docs/branching.md`

```
feature/**  →  integration/**  →  develop  →  master
           (Fast CI)      (Full CI)   (本番)
```

- 作業ブランチは `feature/{issue-number}-{slug}` 形式で作成する
- `{issue-number}` は対応する GitHub Issue 番号を使用する
- `{slug}` は Issue タイトルまたは作業内容を短く表す英小文字 kebab-case とする
    - 例: Issue #2835「AGENTS.md にブランチ命名規則のガイドラインを追記する」→ `feature/2835-agents-md`
    - スペース、スラッシュ、日本語、記号は使用しない
- Issue 番号がない場合は原則ブランチを作成せず、先に Issue の作成または番号の確認を行う
- PR のターゲットは原則 `integration/{service-name}` または `develop`

---

## ドキュメント駆動開発

- 実装は必ずドキュメントに従う。ドキュメントなしに実装しない
- 開発時ドキュメントは `tasks/{feature-name}/` に置く（完了後に `docs/` へ永続化・削除）
- 仕様が不明瞭・矛盾している場合は実装を停止し、Issue コメントで報告する

---

## 参考ドキュメント

- コーディング規約: `docs/development/rules.md`
- アーキテクチャ: `docs/development/architecture.md`
- テスト戦略: `docs/development/testing.md`
- ブランチ戦略: `docs/branching.md`
- 共通ライブラリ: `docs/development/shared-libraries.md`
- エージェント指示: `.github/agents/`
