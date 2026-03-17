<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に docs/development/rules.md 等に関連する注意点があれば統合して削除します。
-->

# eslint v10 / @eslint/js v10 対応 - 要件定義

---

## 1. ビジネス要件

### 1.1 背景・目的

現在リポジトリ全体で ESLint v9 / `@eslint/js` v9 を使用している。
ESLint v10.0.0 が 2026 年 2 月 6 日に正式リリースされ、v9 は 2026 年 8 月以降セキュリティ修正のみの提供となる。

また、Issue #1192 の作成時点では「typescript-eslint が対応するまで待ち」としていたが、
typescript-eslint v8.56.1 のピア依存が `eslint ^8.57.0 || ^9.0.0 || ^10.0.0` に対応済みであるため、
アップグレード可能な状態になっている。

本タスクでは ESLint v10 / `@eslint/js` v10 へのバージョンアップを実施し、
lint 品質を維持したまま最新バージョンに追従する。

### 1.2 対象

- モノレポルートの `package.json`（devDependencies）
- 影響を受ける全ワークスペース（22 個の `eslint.config.mjs`）

### 1.3 ビジネスゴール

- ESLint v10 への追従により、新ルール・パフォーマンス改善の恩恵を受ける
- v9 サポート終了前にアップグレードを完了させる
- 既存の lint 設定・ルールをすべて維持する

---

## 2. 機能要件

### 2.1 ユースケース

#### UC-001: ESLint v10 へのバージョンアップ

- **概要**: `eslint` と `@eslint/js` を v10 にアップグレードし、全ワークスペースで lint が正常に動作する状態にする
- **アクター**: 開発者（CI/CD パイプライン含む）
- **前提条件**: `typescript-eslint` が ESLint v10 対応済みであること（確認済み: v8.56.1 以降）
- **正常フロー**:
    1. `package.json` の `eslint` を `^10`、`@eslint/js` を `^10` に更新する
    2. `npm install` で依存関係を更新する
    3. 全ワークスペースで `npm run lint` を実行し、エラーがないことを確認する
    4. 必要に応じて ESLint 設定やルール定義を調整する
    5. lint・ビルド・テストが全て通過することを確認する
- **代替フロー**: lint エラーが発生した場合、設定を調整して解消する
- **例外フロー**: 依存パッケージが ESLint v10 未対応の場合は対応待ちとし、Issue にコメントを残す

### 2.2 機能一覧

| 機能ID | 機能名 | 説明 | 優先度 |
| ------ | ------ | ---- | ------ |
| F-001 | バージョンアップ | `eslint` / `@eslint/js` を v10 に更新 | 高 |
| F-002 | lint 正常動作確認 | 全 22 ワークスペースで lint エラーなし | 高 |
| F-003 | CI パス確認 | 全ワークスペースのビルド・テストが通過 | 高 |

---

## 3. 非機能要件

### 3.1 パフォーマンス要件

| 項目 | 要件 |
| ---- | ---- |
| lint 実行時間 | v9 と同等以上（ESLint v10 はパフォーマンス改善あり） |

### 3.2 セキュリティ要件

- アップグレード後のパッケージに既知の脆弱性がないこと

### 3.3 保守性・拡張性要件

- 既存の lint ルール定義（`configs/eslint.config.base.mjs`、`configs/eslint.config.core.mjs`）を維持すること
- v10 の新機能は本タスクのスコープ外とし、動作確認のみ行う

---

## 4. 制約・前提条件

- **Node.js バージョン**: ESLint v10 は Node.js >= 20.19.0 を要求するが、当リポジトリは `engines: { node: ">=22.0.0" }` で既に満足している
- **Flat Config**: 全ワークスペースが `eslint.config.mjs`（flat config 形式）を採用済み。ESLint v10 で `.eslintrc` が完全廃止されるが影響なし
- **eslint-config-next**: v16.1.6 の peerDeps は `eslint >=9.0.0` で v10 対応済み
- **typescript-eslint**: v8.56.1 の peerDeps が `eslint ^8.57.0 || ^9.0.0 || ^10.0.0` で v10 対応済み

---

## 5. スコープ外

- ❌ ESLint v10 の新ルール追加（本タスクはバージョンアップのみ）
- ❌ lint 設定の大幅な見直し・改善
- ❌ `@typescript-eslint` ルールの新規追加
- ❌ `eslint-config-next` のバージョンアップ（別タスク）

---

## 6. 用語集

| 用語 | 定義 |
| ---- | ---- |
| flat config | ESLint v8.21.0 以降で導入された設定形式（`eslint.config.mjs`）。ESLint v10 で唯一サポートされる形式 |
| typescript-eslint | TypeScript 向けの ESLint プラグイン・パーサーセット |
| eslint-config-next | Next.js が提供する ESLint 共有設定 |
