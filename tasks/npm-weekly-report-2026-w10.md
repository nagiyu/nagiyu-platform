# 週次npm管理レポート 2026年第10週 対応計画

## 概要

2026-03-09に自動生成された週次npm管理レポートに基づき、セキュリティ脆弱性の修正および
パッケージ更新を実施する。

## 関連情報

- Issue: #（週次npm管理レポート 2026-03-09）
- タスクタイプ: プラットフォームタスク（依存パッケージ管理）
- 報告日時: 2026-03-09 01:37 UTC

---

## 要件

### 機能要件

- FR1: Priority 1（セキュリティ脆弱性 High 6件・Low 2件）をすべて解消すること
- FR2: Priority 3（重複パッケージの統合）を検討・実施すること
- FR3: Priority 3（パッケージ更新）でパッチ・マイナー更新を実施すること
- FR4: 更新後にビルドおよびテストが通過すること

### 非機能要件

- NFR1: ルートから `--workspace` オプションを使い各ワークスペースに `node_modules` や `package-lock.json` が個別生成されないようにすること
- NFR2: メジャーバージョン更新は破壊的変更の有無を事前確認してから実施すること
- NFR3: セキュリティ修正は最優先で対応すること

---

## 実装のヒント

### Priority 1: セキュリティ脆弱性

`npm audit` が検出した脆弱性の根本原因は `serialize-javascript <= 7.0.2`（GHSA-5c6j-r48x-rmvq）。
依存チェーンは以下の通り：

```
next-pwa@^5.6.0
  └─ workbox-webpack-plugin
       └─ workbox-build
            └─ rollup-plugin-terser
                 └─ serialize-javascript (<= 7.0.2)  ← 脆弱性の根本
```

`next-pwa@5.6.0` の最新版では上流依存が修正されていないため、ルートの `package.json` に
`overrides` を使って `serialize-javascript` を `>=7.0.3` に強制することが現実的な対処法となる。

`fast-xml-parser` の Low 脆弱性（GHSA-fj3w-jwp8-x2g3、範囲: `>=5.0.0 <5.3.8`）は
AWS SDK の推移的依存のため、`overrides` で `>=5.3.8` に強制する。

**推奨対処**（ルート `package.json`）：

```json
"overrides": {
    "serialize-javascript": ">=7.0.3",
    "fast-xml-parser": ">=5.3.8"
}
```

> **注意**: `next-pwa@2.0.2` への「メジャーバージョン更新」は npm audit の誤案内の可能性が高い
> （npm の dist-tags 上で latest は 5.6.0）。overrides による推移的依存の固定を優先すること。

### Priority 3: パッケージ更新

更新対象を安全性レベルで分類する：

#### A. パッチ・マイナー更新（比較的安全）

| パッケージ | 現在 | 更新後 | 影響ワークスペース |
|-----------|------|--------|-----------------|
| `@aws-sdk/client-batch` | 3.1000.0 | 3.1004.0 | codec-converter/batch, codec-converter/web, niconico-mylist-assistant/web, stock-tracker/web |
| `@aws-sdk/client-dynamodb` | 3.1000.0 | 3.1004.0 | 多数 |
| `@aws-sdk/client-s3` | 3.1000.0 | 3.1004.0 | 多数 |
| `@aws-sdk/client-lambda` | 3.1000.0 | 3.1004.0 | stock-tracker/web |
| `@aws-sdk/client-secrets-manager` | 3.1000.0 | 3.1004.0 | niconico-mylist-assistant/batch, core, web |
| `@aws-sdk/lib-dynamodb` | 3.1000.0 | 3.1004.0 | 多数 |
| `@aws-sdk/middleware-endpoint-discovery` | 3.972.3 | 3.972.7 | ルート |
| `@aws-sdk/s3-request-presigner` | 3.1000.0 | 3.1004.0 | codec-converter/web |
| `@aws-sdk/types` | 3.973.1 | 3.973.5 | codec-converter/batch, codec-converter/web |
| `@mui/icons-material` | 7.3.8 | 7.3.9 | ui, admin/web, auth/web, codec-converter/web, niconico-mylist-assistant/web, stock-tracker/web, tools |
| `@mui/material` | 7.3.8 | 7.3.9 | 同上 |
| `@mui/material-nextjs` | 7.3.8 | 7.3.9 | 同上 |
| `@playwright/test` | 1.58.0 | 1.58.2 | niconico-mylist-assistant/batch |
| `@tailwindcss/postcss` | 4.1.18 | 4.2.1 | stock-tracker/web |
| `@types/node` | 22.19.11 | 22.19.15 | 多数 |
| `aws-cdk` | 2.1106.0 | 2.1109.0 | ルート |
| `eslint` | 9.39.2 | 9.39.4 | ルート |
| `@eslint/js` | 9.39.2 | 9.39.4 | ルート |
| `openai` | 6.25.0 | 6.27.0 | stock-tracker/batch |
| `playwright` | 1.58.0 | 1.58.2 | niconico-mylist-assistant/batch |
| `tailwindcss` | 4.1.18 | 4.2.1 | stock-tracker/web |
| `typescript-eslint` | 8.55.0 | 8.56.1 | ルート |

#### B. 要注意パッケージ（更新スキップ推奨）

| パッケージ | 現在 | npm 最新 | 理由 |
|-----------|------|---------|------|
| `@auth/core` | 0.41.1 | 0.34.3 | 最新より高いバージョンが既にインストール済み（beta系）|
| `next-auth` | 5.0.0-beta.30 | 4.24.13 | beta版を意図的に使用中。stable 4.x へのダウングレードは禁止 |

### Priority 3: 重複パッケージの統合

以下のパッケージは3箇所以上のワークスペースで同一バージョンが使用されている。
ルートへ移行すると管理が簡素化されるが、**既にルートに同じパッケージが存在する場合は
重複削除のみ実施すれば十分**。

- `@types/jest` (5箇所): ルートに既存あり → 各ワークスペースから削除
- `@types/node` (4箇所): ルートに既存あり → 各ワークスペースから削除
- `@types/web-push` (3箇所): ルートに存在しない → 統合を検討（stock-tracker/batch, stock-tracker/web, niconico-mylist-assistant/batch）

---

## タスク

### Phase 1: セキュリティ脆弱性の修正（最優先）

- [x] T001: ルート `package.json` の `overrides` で `fast-xml-parser >= 5.3.8` を適用
- [x] T002: `serialize-javascript` 脆弱性の経路になっていた `next-pwa` 依存を除去（`services/tools`, `services/stock-tracker/web`）
- [x] T003: ルートから `npm install` を実行して `package-lock.json` を更新
- [x] T004: `npm audit` を再実行して脆弱性 0 件を確認

### Phase 2: パッケージ更新（パッチ・マイナー）

- [x] T005: ルートの AWS SDK 系パッケージを更新（`@aws-sdk/*` を 3.1004.0 へ）
- [x] T006: ルートの MUI 系パッケージを更新（`@mui/*` を 7.3.9 へ）
- [x] T007: `@types/node` をルートと全ワークスペースで `^22.19.15` へ更新
- [x] T008: 各ワークスペースの AWS SDK パッケージを更新
- [x] T009: その他のパッチ更新（eslint, typescript-eslint, aws-cdk, openai, playwright, tailwindcss など）
- [x] T010: ビルドおよびユニットテストで動作確認

### Phase 3: 重複パッケージの整理（任意・低優先）

- [ ] T011: `@types/jest` を各ワークスペース（libs/common, libs/react, libs/nextjs, stock-tracker/web, infra/codec-converter）から削除（ルートに集約済み）
- [ ] T012: `@types/node` を各ワークスペース（libs/aws, libs/react, stock-tracker/core, infra/codec-converter）から削除（ルートに集約済み）
- [ ] T013: `@types/web-push` のルート統合を検討・実施

---

## 参考ドキュメント

- [コーディング規約](../docs/development/rules.md)
- [ブランチ戦略](../docs/branching.md)
- [テスト戦略](../docs/development/testing.md)

---

## 備考・未決定事項

- `next-pwa` の後継として `@ducanh2912/next-pwa` への移行も長期的に検討すべきだが、今回のスコープ外とする
- `@auth/core` と `next-auth` は現在ベータ版を使用中。stable へのダウングレードは機能影響が大きいため、別Issueで検討する
- `@types/node@25.x` へのメジャーアップグレードは今回対象外（Node.js バージョンとの整合性確認が必要）
- `@eslint/js` および `eslint` の `10.x` へのメジャーアップグレードは今回対象外（ESLint 設定の互換性確認が必要）
