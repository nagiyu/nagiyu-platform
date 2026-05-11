# CLAUDE.md - nagiyu-platform Claude 運用ガイドライン

本ファイルは Claude（Claude Code / claude.ai/code 等）が本リポジトリで作業する際に、毎回必ず守るべき運用ルールを定める。

技術詳細は `docs/` 配下のドキュメントを参照すること。本ファイルは Claude 専用の運用ハンドブックとして自己完結させており、他の AI エージェント向け指示（`AGENTS.md` 等）とは独立している。

---

## 言語

**MUST: Claude のすべての出力（PR 説明・Issue コメント・コミットメッセージ・コード内コメント等）は日本語で記述すること**

- コードスニペット・エラーメッセージ内の英語はそのまま保持する
- TypeScript / Next.js / React などの技術用語は英語のまま使用してよい

---

## 対応フロー（MUST）

すべての対応は以下の順序で進める。

```
1. Issue 起票
        ↓
2. integration/{issue-number}-{slug} ブランチ作成（develop から分岐）
        ↓
3. 作業ブランチ作成（claude/** など）
        ↓
4. 実装・コミット・push
        ↓
5. 作業ブランチ → integration/{issue-number}-{slug} へ Draft PR 作成
        ↓
6. ★ 人力レビュー・Ready 化・マージ ★（Claude は介入しない）
        ↓
7. dev 環境への反映確認（人力）
        ↓
8. 対応完了の確認後、人に確認を取って integration/{issue-number}-{slug} → develop の PR を作成（Draft）
        ↓
9. ★ 人力レビュー・Ready 化・マージ ★
```

### ステップごとの注意

#### 1. Issue 起票

- すべての対応は Issue 起票から始める
- ラベル・マイルストーン・Assignee は **Claude が付与しない**（人力で付ける）
- Issue 本文には背景・スコープ・完了条件・ゴールを明記する

#### 2. integration ブランチ作成

- 命名: `integration/{issue-number}-{slug}`（例: `integration/2880-claude-guidelines`）
- 分岐元: `develop`
- 1 Issue につき 1 つの integration ブランチを基本とする

#### 3. 作業ブランチ作成

- Claude Code 経由で作成される `claude/**` ブランチをそのまま使ってよい
- Issue 番号と紐づくスラッグを含めることを推奨

#### 4. 実装・コミット・push

- コミットメッセージは日本語で簡潔に
- `git push -u origin <branch-name>` を使用
- ネットワークエラー時は最大 4 回まで指数バックオフ（2s, 4s, 8s, 16s）でリトライ
- `--no-verify` 等でフックをスキップしない（明示的な指示がある場合を除く）

#### 5. 作業ブランチ → integration への Draft PR

- ターゲットは必ず `integration/{issue-number}-{slug}`
- **必ず Draft で作成する**
- `.github/pull_request_template.md` の項目を埋める
- PR 本文に `Closes #{issue-number}` を含めない（Issue は integration → develop マージ後にクローズする）

#### 8. integration → develop の PR

- Claude が作成してよいが、**作成前に必ず人に確認を取る**
- 「対応がすべて完了したので、integration → develop の PR を作成してよいか」を明示的に質問する
- 承認後、Draft PR として作成する
- PR 本文に `Closes #{issue-number}` を含めてよい

---

## Claude が自動で行わないこと（MUST NOT）

以下は人力チェックを挟むため、Claude は自律的に実行してはならない。

- **PR ステータスの変更**
    - Draft → Ready の切替
    - PR のマージ
    - PR のクローズ（明示的な指示がある場合を除く）
- **ラベル・マイルストーン・Assignee の付与・変更**（Issue / PR 共通）
- **`develop` / `master` ブランチへの直接 push**
- **`develop` / `master` ブランチへの強制 push（force push）**
- **`integration/xxx` → `develop` の PR 作成**（人の確認が取れた場合のみ可）
- **既存 PR の説明・タイトルの大幅な書き換え**（軽微な修正は可）
- **Issue / PR への過剰なコメント投下**（必要なときだけ）

レビュー対応で追加 push を行っても、Draft 状態は維持すること。Ready 化は人が判断する。

---

## ブランチ戦略の概要

```
claude/**, feature/**  →  integration/**  →  develop  →  master
                       (Fast CI)        (Full CI)    (本番)
```

- `integration/**` と `develop` は dev 環境へ自動デプロイされる
- `master` は本番デプロイ
- 詳細は [`docs/branching.md`](docs/branching.md) を参照

---

## ドキュメント駆動開発

**MUST: 実装は必ずドキュメントに従う。ドキュメントなしに実装しない**

- 開発時の一時ドキュメントは `tasks/{feature-name}/` 配下に作成する
- 完了後に永続化すべき内容は `docs/` に反映し、`tasks/{feature-name}/` を削除する
- 仕様が不明瞭・矛盾している場合は **実装を停止し、Issue コメントで報告して人に判断を仰ぐ**
- 詳細は [`docs/development/flow.md`](docs/development/flow.md) を参照

---

## コーディング規約（要点）

詳細は [`docs/development/rules.md`](docs/development/rules.md) を参照。

### MUST

- TypeScript strict mode 必須
- テストカバレッジ 80% 以上（Jest `coverageThreshold` で自動失敗）
- エラーメッセージは日本語 + 定数化（`ERROR_MESSAGES` オブジェクト）
- UI 層（`components/`, `app/`）とビジネスロジック（`lib/`）を分離
- ライブラリ依存の一方向性を保つ（`ui → browser → common`、循環依存禁止）

### MUST NOT

- ライブラリ内でパスエイリアス（`@/`）を使用しない
- `dangerouslySetInnerHTML` を直接使用しない（DOMPurify 経由のみ）

---

## テスト要件（要点）

詳細は [`docs/development/testing.md`](docs/development/testing.md) を参照。

- テストファイルは `tests/` 配下に配置（`src/` と分離）
- 副作用がある処理のみモック化、純粋関数はそのまま実行
- E2E: Fast CI は `chromium-mobile` のみ、Full CI は全デバイス

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

---

## 実行環境

Claude Code on the web で本リポジトリを扱う際の環境固有の事情と運用方針は [`docs/development/claude-environment.md`](docs/development/claude-environment.md) にまとめてある。Playwright / AWS CLI / shared libs ビルド等の相談を受けたら、まずそのドキュメントを参照する。

要点：

- **環境構築の 2 系統**：claude.ai/code の Setup Script（約 7 日キャッシュ、UI 設定）と `.claude/settings.json` の SessionStart hook（毎セッション）は別物。本リポジトリは前者のみ使い、後者は使わない方針
- **Playwright**：素の `npx playwright install` はベースイメージ同梱の global（1.56.1）を呼んでしまうため使わない。プロジェクトローカル CLI（`node_modules/.bin/playwright`）か `npx playwright@<project-version>` を使う
- **WebKit の E2E は on-demand**：Full CI 相当の確認が必要なセッションでのみ `playwright install --with-deps webkit` を実行する
- **shared libs のビルド**：`next dev` や E2E を回す前に `@nagiyu/common → browser → ui → nextjs` の順で `dist/` をビルドする（`npm ci` だけでは作られない）

---

## PR テンプレート遵守

PR 作成時は `.github/pull_request_template.md` の構造に従い、以下を確実に記述する。

- 変更の概要
- 関連 Issue（integration → develop の PR でのみ `Closes #` を使用）
- 変更種別のチェック
- 実装チェックリストの完了状況
- テスト内容
- レビューポイント
- UI 変更がある場合のスクリーンショット

---

## 困ったときの停止判断

以下の状況では作業を停止し、Issue コメントまたはチャットで人に判断を仰ぐ。

- ドキュメントに不明瞭・矛盾がある
- 設計上の重要な分岐判断が必要
- 既存の運用ルールと矛盾する指示を受けた
- 破壊的・不可逆な操作（force push、ブランチ削除、本番リソース変更等）を要求された
- 複数 PR / Issue にまたがる広範囲な変更が必要になった

---

## 参考ドキュメント

- ブランチ戦略: [`docs/branching.md`](docs/branching.md)
- コーディング規約: [`docs/development/rules.md`](docs/development/rules.md)
- アーキテクチャ: [`docs/development/architecture.md`](docs/development/architecture.md)
- テスト戦略: [`docs/development/testing.md`](docs/development/testing.md)
- 開発フロー: [`docs/development/flow.md`](docs/development/flow.md)
- 共通ライブラリ: [`docs/development/shared-libraries.md`](docs/development/shared-libraries.md)
- 共通 UI コンポーネント: [`docs/development/shared-ui-components.md`](docs/development/shared-ui-components.md)
- 実行環境（Claude on Web）: [`docs/development/claude-environment.md`](docs/development/claude-environment.md)
- PR テンプレート: [`.github/pull_request_template.md`](.github/pull_request_template.md)
