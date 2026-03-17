<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-1194-typesnode-v25/ ディレクトリごと削除します。
-->

# Node.js v24 / `@types/node` v24 対応 - 要件定義

---

## 1. ビジネス要件

### 1.1 背景・目的

- TypeScript の型定義パッケージ `@types/node` を現在の `^22` から **`^24`** へアップグレードする
- 合わせて Node.js ランタイム自体も v22 から **v24（Active LTS）** へアップグレードする
- Node.js v24 は 2025年10月28日に Active LTS に昇格しており、2028年4月30日まで長期サポートが保証されている
- これにより、型安全性の向上・最新 API の活用・セキュリティアップデートの継続受信を実現する

### 1.2 対象ユーザー

- **プライマリー**: プラットフォーム開発者（型定義・ランタイムの恩恵を受ける全開発者）

### 1.3 ビジネスゴール

- Node.js ランタイムを最新の Active LTS（v24）に追従させる
- `@types/node` を v24 系に更新し、Node.js ランタイムと型定義バージョンを一致させる
- Docker・CI・DevContainer を含むすべての環境で一貫した Node.js バージョンを使用する
- 型チェック・Lint・テストがすべて通過する状態を維持する

---

## 2. 機能要件

### 2.1 ユースケース

#### UC-001: Node.js ランタイムのアップグレード

- **概要**: Docker、CI、DevContainer、`package.json` engines などすべての環境で Node.js を v22 から v24 に変更する
- **アクター**: 開発者
- **前提条件**: 現在の Node.js が v22 で固定されている
- **正常フロー**:
    1. 各 Dockerfile の `FROM node:22-*` を `node:24-*` に変更する
    2. Lambda 用 Dockerfile の `public.ecr.aws/lambda/nodejs:22` を `nodejs:24` に変更する
    3. DevContainer Dockerfile の `mcr.microsoft.com/devcontainers/typescript-node:1-22-bullseye` を `4-24-bullseye` に変更する
    4. GitHub Actions ワークフローの `node-version: '22'` を `'24'` に変更する
    5. `package.json` の `engines.node` を `>=22.0.0` から `>=24.0.0` に変更する
    6. 全環境でビルド・テスト・Lint がパスする
- **例外フロー**: 破壊的変更による動作不整合が発生した場合は修正する

#### UC-002: `@types/node` のアップグレード

- **概要**: ルート `package.json` の `@types/node` バージョン指定を `^22` から `^24` に変更する
- **アクター**: 開発者
- **前提条件**: 現在の `@types/node` が `^22` で固定されている
- **正常フロー**:
    1. ルート `package.json` の `devDependencies` を `^24` に変更する
    2. `npm install` を実行し、`package-lock.json` を更新する
    3. TypeScript の型チェックがパスする
- **例外フロー**: 型エラーが発生した場合は、変更箇所を特定して修正する

### 2.2 機能一覧

| 機能ID | 機能名 | 説明 | 優先度 |
| ------ | ------ | ---- | ------ |
| F-001 | Dockerfile 更新 | 全 Dockerfile の Node.js を v22 → v24 に変更する | 高 |
| F-002 | CI ワークフロー更新 | 全 GitHub Actions ワークフローの `node-version` を `'22'` → `'24'` に変更する | 高 |
| F-003 | `package.json` engines 更新 | `engines.node` を `>=22.0.0` → `>=24.0.0` に変更する | 高 |
| F-004 | `@types/node` バージョン更新 | `@types/node` を `^22` → `^24` に変更する | 高 |
| F-005 | 型エラー・動作不整合の修正 | 変更に伴う型エラーや破壊的変更の修正 | 高 |

---

## 3. 非機能要件

### 3.1 パフォーマンス要件

- アプリケーションの応答性能に劣化が発生しないこと（Node.js v24 は v22 と同等またはそれ以上の性能）

### 3.2 セキュリティ要件

- `npm audit` で新たな高レベル脆弱性が検出されないこと
- Node.js v24 は Active LTS のため、セキュリティアップデートが継続的に提供される

### 3.3 可用性要件

- 既存の CI/CD パイプラインがすべて正常に完了すること

### 3.4 保守性・拡張性要件

- `@types/node` はルート `package.json` 一箇所のみに定義されているため、モノレポ全体に一括適用される
- DevContainer のイメージタグは `1-22-bullseye` から `4-24-bullseye` へ変更が必要（イメージのメジャーバージョンも変更）

---

## 4. スコープ外

- ❌ Node.js v25 への変更（奇数バージョンのため LTS なし）
- ❌ Node.js v24 の新機能を活用したアプリケーションロジックの変更
- ❌ `@types/node` 以外の型定義パッケージの変更
- ❌ `niconico-mylist-assistant/batch/Dockerfile` の Node.js バージョン変更（Playwright 公式イメージを使用しており、Node.js バージョンは Playwright イメージ側で管理）
