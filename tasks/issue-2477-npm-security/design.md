# npm セキュリティ対応 - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/services/{service}/architecture.md に ADR として抽出し、
    tasks/{feature-name}/ ディレクトリごと削除します。

    入力: tasks/issue-2477-npm-security/requirements.md
    次に作成するドキュメント: tasks/issue-2477-npm-security/tasks.md
-->

## 脆弱性調査結果

### handlebars（Critical）

- **影響バージョン**: 4.0.0 〜 4.7.8
- **CVSS スコア**: 最大 9.8（Critical）
- **脆弱性概要**:
    - JavaScript Injection via CLI Precompiler（CVSS 8.3）
    - JavaScript Injection via AST Type Confusion（複数、CVSS 8.1〜9.8）
    - Denial of Service via Malformed Decorator Syntax（CVSS 7.5）
    - Prototype Pollution → XSS（Moderate, CVSS 4.7）
    - Prototype Method Access Control Gap（Moderate, CVSS 4.8）
- **依存元**: 間接依存（`isDirect: false`）。`node_modules/handlebars` として存在
- **修正**: fix available（`npm audit fix` または `overrides` で 4.7.9 以上に固定）
- **調査が必要な点**: `handlebars` を直接依存する親パッケージの特定（jest や istanbul/nyc 系ツール、または eslint プラグインの可能性）

### path-to-regexp（High）

- **影響バージョン**: 8.0.0 〜 8.3.0
- **CVSS スコア**: 最大 7.5（High）
- **脆弱性概要**:
    - DoS via sequential optional groups（CVSS 7.5）
    - ReDoS via multiple wildcards（Moderate, CVSS 5.9）
- **依存元**: 間接依存（`isDirect: false`）。`node_modules/path-to-regexp` として存在
- **修正**: fix available（8.4.0 以上へ更新）
- **調査が必要な点**: `path-to-regexp` 8.x を依存する親パッケージの特定（`next`、`express`、`@remix-run/router` などの可能性）

### picomatch（High）

- **影響バージョン**: <= 2.3.1 または 4.0.0 〜 4.0.3
- **CVSS スコア**: 最大 7.5（High）
- **脆弱性概要**:
    - Method Injection in POSIX Character Classes（Moderate, CVSS 5.3）
    - ReDoS via extglob quantifiers（High, CVSS 7.5）
- **依存元**: 間接依存。以下の node_modules 配下に複数存在:
    - `node_modules/jest-haste-map/node_modules/picomatch`
    - `node_modules/jest-message-util/node_modules/picomatch`
    - `node_modules/jest-util/node_modules/picomatch`
    - `node_modules/picomatch`
    - `node_modules/tinyglobby/node_modules/picomatch`
- **修正**: fix available（各親パッケージの更新で解消）
- **調査が必要な点**: `jest` v30 が内部で使用する picomatch のバージョン

---

## 対応方針

### Priority 1: セキュリティ脆弱性修正

#### ステップ 1: npm audit fix の実行と結果確認

まず `npm audit fix` を試みて、自動的に修正できる範囲を確認する。
セマンティックバージョンの互換範囲内で安全なバージョンへ更新される。

#### ステップ 2: 残存する脆弱性への対処

`npm audit fix` で解消しない場合は以下を検討する:

1. **依存元パッケージのバージョンアップ**: 脆弱パッケージを依存している親パッケージを更新し、安全なバージョンの依存関係を引き込む
2. **`overrides` による強制固定**: `package.json` の `overrides` セクションに安全なバージョンを明示する

package.json の overrides 例（調査後に実際のパッケージ名・バージョンを決定）:

```json
{
    "overrides": {
        "handlebars": ">=4.7.9",
        "path-to-regexp": ">=8.4.0",
        "picomatch": ">=2.3.2"
    }
}
```

#### ステップ 3: 検証

- `npm audit` を再実行して Critical/High が 0 件になることを確認
- 全ワークスペースのビルド・テストが通過することを確認

### Priority 3-1: devDependency 重複統合

`aws-sdk-client-mock` が以下 3 ワークスペースで同一バージョン（`^4.1.0`）を使用している:

- `services/admin/core`
- `services/niconico-mylist-assistant/core`
- `services/codec-converter/batch`

ルートの `package.json` に統合することで管理を簡素化できる。

### Priority 3-2: パッケージ更新

以下の更新を検討する（優先度順）:

| パッケージ | 現在 | 最新 | 判断 |
| --------- | ---- | ---- | ---- |
| `@aws-sdk/*` 系 | 3.1010.0 | 3.1019.0 | ✅ パッチ更新、適用推奨 |
| `aws-cdk-lib` | 2.243.0 | 2.245.0 | ✅ パッチ更新、適用推奨 |
| `constructs` | 10.5.1 | 10.6.0 | ✅ マイナー更新、適用推奨 |
| `next` | 16.1.7 | 16.2.1 | ✅ マイナー更新、テスト要確認 |
| `eslint` | 10.0.3 | 10.1.0 | ✅ マイナー更新 |
| `tailwindcss` / `@tailwindcss/postcss` | 4.2.1 | 4.2.2 | ✅ パッチ更新 |
| `playwright` | 1.58.0 | 1.58.2 | ✅ パッチ更新 |
| `typescript-eslint` | 8.57.1 | 8.57.2 | ✅ パッチ更新 |
| `openai` | 6.31.0 | 6.33.0 | ✅ パッチ更新 |
| `next-auth` | 5.0.0-beta.30 | 4.24.13 | ❌ beta → stable の downgrade、別 Issue で対応 |
| `@auth/core` | 0.41.1 | 0.34.3 | ❌ downgrade になるため保留 |
| `typescript` | 5.9.3 | 6.0.2 | ❌ メジャー更新、別 Issue で対応 |
| `@types/node` | 24.12.0 | 25.5.0 | ❌ メジャー更新、別 Issue で対応 |

---

## コンポーネント設計

### 影響範囲

本対応はコードの変更ではなく、`package.json` および `package-lock.json` の更新が主体。

| 対象ファイル | 変更内容 |
| ----------- | -------- |
| `package.json`（ルート） | `overrides` の追加（必要な場合）、`aws-sdk-client-mock` の追加、各パッケージのバージョン更新 |
| `package-lock.json`（ルート） | `npm install` / `npm audit fix` 実行後に自動更新 |
| 各ワークスペースの `package.json` | `aws-sdk-client-mock` の削除（統合後） |

---

## 実装上の注意点

### 依存関係・前提条件

- 作業前に `npm audit` を実行し、現在の脆弱性を再確認すること（Issue は 2026-03-30 時点のレポートのため、現在と状態が異なる可能性がある）
- 各脆弱パッケージの直接依存元を `npm ls {package}` で特定してから対応方針を確定すること

### パフォーマンス考慮事項

- `overrides` を使用する場合、依存グラフが変わるためビルド時間に影響が出ないことを確認する

### セキュリティ考慮事項

- `npm audit fix --force` は semver 互換範囲外の更新も適用するため、破壊的変更のリスクがある。まず `npm audit fix` のみ試み、残存する場合に `--force` や `overrides` を検討する
- `overrides` での強制固定後、依存元パッケージの動作検証を十分に行うこと

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `docs/development/rules.md` に npm セキュリティ対応のガイドライン（overrides の使用方針）を必要に応じて追記すること
- [ ] 対応完了後の `npm audit` 結果スナップショットを PR 説明に残すこと
- [ ] `tasks/issue-2477-npm-security/` ディレクトリを削除すること
