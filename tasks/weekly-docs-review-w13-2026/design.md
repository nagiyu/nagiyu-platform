# 週次ドキュメントレビュー 第13週（2026-03-30） - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/ に反映し、
    tasks/weekly-docs-review-w13-2026/ ディレクトリごと削除します。

    入力: tasks/weekly-docs-review-w13-2026/requirements.md
    次に作成するドキュメント: tasks/weekly-docs-review-w13-2026/tasks.md
-->

## 調査結果サマリー

Issue #2474 のチェックリストに基づき、以下の不整合を特定した。

---

## Priority 1: 二重管理の整合性

### 1. Copilot Instructions ⇄ rules.md の整合性

**確認結果**: 整合性あり（要修正なし）

- `copilot-instructions.md` と `docs/development/rules.md` の MUST/SHOULD/MAY/MUST NOT ルールは一致している
- テストカバレッジ 80%、エラーメッセージ日本語化、ライブラリ依存の一方向性、パスエイリアス禁止、`dangerouslySetInnerHTML` 禁止が両ドキュメントに記載されている

### 2. Jest Coverage Threshold ⇄ testing.md の整合性

**確認結果**: 整合性あり（要修正なし）

- 全 `jest.config.ts` の確認により、`services/niconico-mylist-assistant/batch/jest.config.ts` のみ `coverageThreshold` が未設定
- `testing.md` に当該パッケージの例外理由が明記されている（Playwright への直接依存によりモック困難）
- `services/stock-tracker/web/jest.config.ts` は 100% 設定（80% 超は許容）

### 3. Issue Template ⇄ rules.md の整合性

**確認結果**: 整合性あり（要修正なし）

- `.github/ISSUE_TEMPLATE/` の `feature.yml`, `bug.yml`, `refactor.yml` に「テストカバレッジ80%以上」チェック項目あり
- rules.md の MUST ルールをカバーしている

### 4. PR Template ⇄ development ドキュメントの整合性

**確認結果**: 整合性あり（要修正なし）

- `.github/pull_request_template.md` に「テストカバレッジ80%以上」「関連ドキュメントを更新した」チェック項目あり

---

## Priority 2: 構造的整合性

### 5. Branch Strategy の整合性

**確認結果**: 整合性あり（要修正なし）

- `docs/branching.md` と `.github/copilot-instructions.md` のブランチフロー（`feature/** → integration/** → develop → master`）および Fast CI / Full CI の記述が一致している

### 6. Monorepo Structure の整合性

**確認結果**: ⚠️ 不整合あり（要修正）

- **問題**: `docs/development/monorepo-structure.md` に `libs/nextjs/` の記載がない
    - 「対象」リスト（`libs/common/`, `libs/browser/`, `libs/ui/`, `libs/react/`, `libs/aws/`）に `libs/nextjs/` が含まれていない
    - ディレクトリツリーに `libs/nextjs/` が含まれていない
    - 依存関係ルールセクションに `libs/nextjs` の依存関係が記載されていない
- **対比**: `docs/development/shared-libraries.md`、`docs/README.md`、`.github/copilot-instructions.md`、`docs/development/authentication.md` では `libs/nextjs/` と `@nagiyu/nextjs` が正しく記載されている
- **SSoT**: `docs/development/monorepo-structure.md` を `docs/development/shared-libraries.md` と整合させる
- **修正内容**:
    - 「対象」リストに `libs/nextjs/` を追加
    - ディレクトリツリーに `libs/nextjs/` エントリを追加
    - 依存関係ルールに `libs/nextjs → libs/common` を追加

### 7. Test Device Configuration の整合性

**確認結果**: 整合性あり（要修正なし）

- `docs/development/testing.md` と CI ワークフローで Fast CI（`chromium-mobile` のみ）および Full CI（全デバイス）の設定が一致している

---

## Priority 3: ドキュメント間の整合性

### 8. テストカバレッジ 80% 記載一貫性

**確認結果**: 整合性あり（要修正なし）

- `niconico-mylist-assistant/batch` の例外が `testing.md` に文書化されており、整合性が保たれている

### 9. ライブラリ依存方向の記載一貫性

**確認結果**: ⚠️ 部分的に不整合（F-004 の修正で同時対応）

- `docs/development/monorepo-structure.md` の依存関係ルールセクションに `libs/nextjs` が欠落（F-004 の修正に含める）

### 10. MUST/SHOULD ルールの重複と矛盾

**確認結果**: 整合性あり（要修正なし）

- `docs/development/rules.md` が SSoT として機能しており、他のドキュメントは参照リンクで指している

### 11. ドキュメント間のリンク切れチェック

**確認結果**: 整合性あり（要修正なし）

- Issue #2474 の自動確認コマンド結果「✅ リンク切れなし」

### 12. ドキュメント間の重複記述チェック

**確認結果**: 整合性あり（要修正なし）

- 重複記述は意図的なもの（各ドキュメントの読者に必要な情報）であり、内容は一致している

---

## Priority 4: 実装との乖離

### 13. 実装との乖離チェック

**確認結果**: スキップ（今週の変更範囲外）

### 14. 方針変更の追従漏れチェック

**確認結果**: 整合性あり（要修正なし）

- 過去1週間の変更コミット `0781571 Merge pull request #2439 from nagiyu/release/v6.5.0` は `docs/` の方針変更を含まない

---

## 修正対象ファイル

| ファイル | 修正内容 | 優先度 |
| ------- | ------- | ------ |
| `docs/development/monorepo-structure.md` | `libs/nextjs/` をライブラリ一覧・ディレクトリツリー・依存関係ルールに追加 | 中 |

---

## 実装上の注意点

### 依存関係・前提条件

- `libs/nextjs/` の依存関係は `docs/development/shared-libraries.md` の記述に合わせる
    - `libs/nextjs` は `libs/common` に依存する（`shared-libraries.md` より確認）

### セキュリティ考慮事項

- ドキュメント修正のみのため、セキュリティへの影響なし

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `docs/development/monorepo-structure.md` の修正をそのまま永続化する（このファイルが対象ドキュメント自体のため、修正完了後に本 tasks ディレクトリを削除する）
