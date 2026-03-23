<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に docs/services/{service}/requirements.md に統合して削除します。
-->

# npm セキュリティ脆弱性対応 要件定義書

---

## 1. ビジネス要件

### 1.1 背景・目的

2026年第12週 npm 管理レポート（Issue #2343）において、`npm audit` により高重大度のセキュリティ脆弱性が検出された。
依存パッケージの強制バージョン指定（overrides）を更新することで、既知の脆弱性を解消する。

### 1.2 対象ユーザー

- プラットフォーム開発者・運用者

### 1.3 ビジネスゴール

- 高重大度の npm セキュリティ脆弱性をすべて解消する
- `npm audit --audit-level=high` で警告ゼロの状態を達成する
- パッケージバージョンの不整合を解消し、依存関係を統一する

---

## 2. 機能要件

### 2.1 ユースケース

#### UC-001: fast-xml-parser の脆弱性修正

- **概要**: `fast-xml-parser` の既存 override（5.5.5）を安全なバージョンに更新する
- **アクター**: 開発者
- **前提条件**: `package.json` の `overrides.fast-xml-parser` が `5.5.5`（脆弱なバージョン）に設定されている
- **正常フロー**:
    1. `overrides.fast-xml-parser` を `5.5.8`（最新・安全）に更新する
    2. `package-lock.json` を再生成する
    3. `npm audit` で脆弱性が解消されていることを確認する
- **例外フロー**: 更新後にビルドエラーが発生した場合はバージョンを調査して修正する

#### UC-002: flatted の脆弱性修正

- **概要**: Prototype Pollution 脆弱性（GHSA-rf6f-7fwh-wjgh）が検出された `flatted`（`<=3.4.1`）を安全なバージョンに固定する
- **アクター**: 開発者
- **前提条件**: `package.json` に `flatted` の override が存在しない
- **正常フロー**:
    1. `package.json` の `overrides` に `flatted: "3.4.2"` を追加する
    2. `package-lock.json` を再生成する
    3. `npm audit` で脆弱性が解消されていることを確認する

#### UC-003: jest バージョン不整合の解消

- **概要**: `infra/codec-converter` の jest バージョンをルートと統一する
- **アクター**: 開発者
- **前提条件**: `infra/codec-converter/package.json` の jest が `^30.2.0`、ルートが `^30.3.0`
- **正常フロー**:
    1. `infra/codec-converter/package.json` の jest を `^30.3.0` に更新する
    2. `infra/package-lock.json` を再生成する
    3. テストが通ることを確認する

### 2.2 機能一覧

| 機能ID | 機能名 | 説明 | 優先度 |
| ------ | ------ | ---- | ------ |
| F-001 | fast-xml-parser override 更新 | `overrides.fast-xml-parser` を `5.5.8` に更新 | 高 |
| F-002 | flatted override 追加 | `overrides.flatted` を `3.4.2` に追加 | 高 |
| F-003 | jest バージョン不整合修正 | `infra/codec-converter` の jest を `^30.3.0` に統一 | 中 |

---

## 3. 非機能要件

### 3.1 セキュリティ要件

- `npm audit --audit-level=high` で警告ゼロであること
- 新たな脆弱性を導入しないこと

### 3.2 保守性・拡張性要件

- `package.json` の overrides セクションに修正理由をコメントで残さない（変更履歴は git log で管理）
- 各 workspace のパッケージバージョンはルートの指定に追従すること

---

## 4. ドメインオブジェクト

| エンティティ | 説明 |
| ----------- | ---- |
| npm overrides | `package.json` 内で依存パッケージのバージョンを強制指定する機構 |
| fast-xml-parser | AWS SDK が依存する XML パーサーライブラリ（間接依存） |
| flatted | ESLint が依存するシリアライズライブラリ（間接依存） |

---

## 5. スコープ外

- ❌ `fast-xml-parser` や `flatted` を直接依存として利用するコードの変更
- ❌ AWS SDK のメジャーバージョンアップグレード
- ❌ ESLint のバージョンアップグレード
- ❌ Moderate 以下の脆弱性の対応（今回は High 以上を優先）
