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

### ブランチ命名規則

作業ブランチは必ず以下の形式で作成すること:

```
feature/{issue-number}-{slug}
```

**`{issue-number}`**: 対応する GitHub Issue の番号（例: `2835`）

**`{slug}`**: Issue タイトルを kebab-case に変換した短い識別子

- 英数字と `-` のみ使用（記号・スペース → `-`、日本語 → 意味を表す英単語に意訳）
- 5 ワード程度に収める
- 例: `add-branch-naming-guide`、`fix-login-redirect`、`refactor-auth-middleware`

**具体例**:

| Issue タイトル | ブランチ名 |
|---|---|
| `AGENTS.md にブランチ命名規則を追記` | `feature/2835-agents-md` |
| `ログイン後にリダイレクトされない` | `feature/1234-fix-login-redirect` |
| `認証ミドルウェアのリファクタリング` | `feature/5678-refactor-auth-middleware` |

**MUST**:

- Issue 番号を必ず含める（追跡可能性のため）
- `feature/` プレフィックスを使用する（作業ブランチの識別）
- 既存ブランチと重複しないことを確認する

**PR のターゲット**: 原則 `integration/{service-name}` または `develop`

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
