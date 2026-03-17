# eslint v10 / @eslint/js v10 対応 - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/development/rules.md 等に反映し、
    tasks/issue-1192-eslint-v10/ ディレクトリごと削除します。

    入力: tasks/issue-1192-eslint-v10/requirements.md
    次に作成するドキュメント: tasks/issue-1192-eslint-v10/tasks.md
-->

## 変更対象

本タスクはコード変更を伴わない純粋なパッケージバージョンアップである。
変更箇所は `package.json` の devDependencies のみ。

---

## コンポーネント設計

### 変更対象ファイル

| ファイル | 変更内容 |
| -------- | -------- |
| `/package.json` | `eslint` を `^9` → `^10`、`@eslint/js` を `^9.17.0` → `^10` に変更 |
| `/package-lock.json` | `npm install` により自動更新 |

### 影響を受けるワークスペース（確認対象・変更なし）

下記ワークスペースの `eslint.config.mjs` は変更不要だが、lint が正常に動作することを確認する。

| ワークスペース | 設定ファイル | 備考 |
| -------------- | ------------ | ---- |
| `libs/common` | `configs/eslint.config.base.mjs` を参照 | |
| `libs/browser` | `configs/eslint.config.base.mjs` を参照 | |
| `libs/ui` | `configs/eslint.config.base.mjs` を参照 | |
| `libs/react` | `configs/eslint.config.base.mjs` を参照 | |
| `libs/nextjs` | `configs/eslint.config.base.mjs` を参照 | |
| `libs/aws` | `configs/eslint.config.base.mjs` を参照 | |
| `services/*/core` | `configs/eslint.config.core.mjs` を参照 | |
| `services/*/web` | `eslint-config-next` を含む独自設定 | |
| `services/*/batch` | `configs/eslint.config.base.mjs` を参照 | |
| `infra/common` | `configs/eslint.config.base.mjs` を参照 | |

---

## 現状分析

### 現在のバージョン

| パッケージ | 現在 | 目標 |
| ---------- | ---- | ---- |
| `eslint` | `^9`（実 9.39.4） | `^10` |
| `@eslint/js` | `^9.17.0`（実 9.39.4） | `^10` |
| `typescript-eslint` | `^8.54.0`（実 8.56.1） | 変更なし（v10 対応済み） |
| `eslint-config-next` | `^16.1.6` | 変更なし（`eslint >=9.0.0` の要件を満たす） |

### ESLint v10 の主な変更点

1. **`.eslintrc` 完全廃止**: flat config のみサポート。当リポジトリは全て `eslint.config.mjs` を採用済みのため影響なし
2. **Node.js サポート変更**: 18/19/21/23 を削除、20.19.0+ が必要。当リポジトリは `engines.node: ">=22.0.0"` のため影響なし
3. **JSX 参照追跡の改善**: `no-unused-vars` ルールが JSX 参照を正しく追跡するようになった。既存コードで未使用変数の誤検知が解消される可能性がある
4. **`RuleTester` API 変更**: プラグイン・ルール開発者向けの変更。当リポジトリはカスタムルールを持たないため影響なし

### リスク評価

| リスク | 影響度 | 対策 |
| ------ | ------ | ---- |
| `no-unused-vars` 挙動変更による新規 lint エラー | 低 | lint 実行後にエラーを確認し修正する |
| `eslint-config-next` との非互換 | 低 | peerDeps が `eslint >=9.0.0` で v10 対応済み |
| `typescript-eslint` との非互換 | なし | peerDeps が `^8.57.0 || ^9.0.0 || ^10.0.0` で対応済み |

---

## 実装上の注意点

### 依存関係・前提条件

- `npm install` 実行前に `package.json` の変更のみ行う
- `package-lock.json` は `npm install` で自動更新される

### 検証手順

1. `npm install` 実行
2. `npm run lint` でルートから全ワークスペースの lint を確認
3. lint エラーがある場合は内容を確認し、設定変更か修正かを判断する
4. `npm run build` と `npm run test` でリグレッションがないことを確認する

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `docs/development/rules.md` への統合: ESLint v10 固有の注意点があれば追記すること
      （例: `no-unused-vars` の挙動変更、flat config のみサポートなど）
- [ ] 重要な設計決定は特になし（単純なバージョンアップのため ADR は不要）
