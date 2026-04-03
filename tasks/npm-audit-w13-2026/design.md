# NPM パッケージ管理 (2026年第13週) - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/services/{service}/architecture.md に ADR として抽出し、
    tasks/npm-audit-w13-2026/ ディレクトリごと削除します。

    入力: tasks/npm-audit-w13-2026/requirements.md
    次に作成するドキュメント: tasks/npm-audit-w13-2026/tasks.md
-->

## 調査結果

### npm audit 脆弱性（2026-03-30 時点）

| パッケージ | Severity | 依存チェーン | 修正方法 |
| --------- | -------- | ----------- | -------- |
| `handlebars` | critical | `ts-jest@29.4.6` → `handlebars@^4.7.8` | `ts-jest` を更新するか `overrides` で上書き |
| `path-to-regexp` | high | `aws-sdk-client-mock@4.1.0` → `sinon@18.0.1` → `nise@6.1.3` → `path-to-regexp@^8.3.0` | `aws-sdk-client-mock` を更新するか `overrides` で上書き |
| `picomatch` | high | `jest-haste-map` / `jest-message-util` / `jest-util` の内部依存 | `jest` を更新するか `overrides` で上書き |

### npm outdated 主要パッケージ（優先度高）

| パッケージ | 現在バージョン | 最新バージョン | 影響範囲 |
| --------- | ------------- | ------------- | -------- |
| `@aws-sdk/*` 各種 | 3.1010.0 | 3.1019.0 | libs/aws, services/*/core, services/*/web, services/*/batch |
| `next` | 16.1.7 | 16.2.1 | libs/ui, services/*/web |
| `eslint-config-next` | 16.1.7 | 16.2.1 | services/*/web |
| `tailwindcss` / `@tailwindcss/postcss` | 4.2.1 | 4.2.2 | services/stock-tracker/web |
| `aws-cdk` / `aws-cdk-lib` | 2.1111.0 / 2.243.0 | 2.1114.1 / 2.245.0 | infra/* |
| `constructs` | 10.5.1 | 10.6.0 | infra/* |
| `playwright` | 1.58.0 | 1.58.2 | services/niconico-mylist-assistant/batch |
| `openai` | 6.31.0 | 6.33.0 | services/stock-tracker/batch |
| `eslint` | 10.0.3 | 10.1.0 | ルート |
| `typescript-eslint` | 8.57.1 | 8.57.2 | ルート |

### 重複 devDependencies

| パッケージ | 重複箇所 | バージョン |
| --------- | -------- | --------- |
| `aws-sdk-client-mock` | `services/admin/core`, `services/niconico-mylist-assistant/core`, `services/codec-converter/batch` | `^4.1.0` |

---

## 修正方針

### 優先度 1：セキュリティ脆弱性修正

**方針**: `npm audit fix` での自動修正を最初に試みる。自動修正で解消できない場合は、ルート `package.json` に `overrides` フィールドを追加して脆弱なバージョンを強制的に上書きする。

```
// 概念的な overrides 設定例（実際のバージョンは npm audit fix の結果を確認して決定）
overrides: {
    handlebars: ">=4.7.9",           // ts-jest 経由の critical 脆弱性対応
    path-to-regexp: ">=8.4.0",       // nise 経由の high 脆弱性対応
    picomatch: ">=2.3.2"             // jest 内部の high 脆弱性対応
}
```

**注意事項**:
- `overrides` での上書きは、対象パッケージの互換性を破壊するリスクがある
- 適用後は必ずビルド・テストを実行して動作確認を行う
- `npm audit fix --force` は breaking change を含むため原則使用しない

### 優先度 2：パッケージ更新

**方針**: パッケージはワークスペース単位で更新する。Breaking Change のリスクが低いパッチ・マイナーバージョンアップを対象とする。

- **AWS SDK**: モノレポのルートで一括管理しているため、ルートで更新して `npm install` を再実行
- **next / eslint-config-next**: パッチバージョンのため更新リスクは低い。ビルド・Lint・E2E テストで確認
- **aws-cdk / aws-cdk-lib / constructs**: infra ワークスペースごとに更新し、`cdk synth` で確認
- **tailwindcss**: stock-tracker/web のみ影響。パッチバージョンのため更新リスクは低い

### 優先度 3：重複 devDependencies の統合

**方針**: `aws-sdk-client-mock@^4.1.0` をルート `package.json` の `devDependencies` に追加し、各ワークスペースから削除する。

---

## コンポーネント設計

### パッケージ責務分担

| 対象 | 変更内容 |
| ---- | -------- |
| ルート `package.json` | `overrides` 追加（脆弱性修正）/ `aws-sdk-client-mock` を `devDependencies` に追加 |
| 各ワークスペース `package.json` | パッケージバージョン更新 |
| `package-lock.json` | `npm install` により自動更新 |

### 実装モジュール一覧

コードの変更なし。`package.json` および `package-lock.json` の更新のみ。

---

## 実装上の注意点

### 依存関係・前提条件

- ルートで `npm ci` が通ること
- 各ワークスペースのビルド・テストが通ること

### パフォーマンス考慮事項

- `npm install` は全ワークスペースに影響するため、ロックファイルの差分が大きくなる場合がある
- CI の `npm ci` 実行時間が大幅に増加しないことを確認する

### セキュリティ考慮事項

- `overrides` 設定後は `npm audit` で Critical / High が残っていないことを確認する
- パッケージ更新後に新たな脆弱性が導入されていないことを確認する

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `docs/` への反映が必要な永続的な設計変更はなし（パッケージ管理の運用変更のみ）
- [ ] `overrides` を採用した場合、その理由を PR コメントまたは ADR として残すことを検討する
