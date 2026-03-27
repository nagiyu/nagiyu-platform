<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に docs/development/shared-libraries.md に統合して削除します。
-->

# コード共通化調査・対応 - 要件定義

## 背景・目的

複数サービス間で同一または類似のロジックが重複実装されている。
これらを `libs/` 配下の共通ライブラリに集約することで、
コードの重複を排除し、保守性・一貫性を向上させる。

## スコープ

調査・対応対象：

- services/admin
- services/auth
- services/codec-converter
- services/niconico-mylist-assistant
- services/share-together
- services/stock-tracker
- services/tools
- libs/aws
- libs/browser
- libs/common

## 機能要件

### FR1: Web Push 設定関数の共通化

複数サービスで重複している `getVapidConfig()` 関数を `libs/common` の `push` モジュールに統合する。

- 対象: `services/stock-tracker/batch/src/lib/web-push-client.ts`
- 対象: `services/niconico-mylist-assistant/batch/src/lib/web-push-client.ts`
- 統合先: `libs/common/src/push/` モジュール

### FR2: User 型定義の統一

`auth` サービスが独自定義する `User` 型を `libs/common` の定義に統一する。

- 対象: `services/auth/core/src/db/types.ts`
- 統一先: `libs/common/src/auth/types.ts` の `User` 型を import して利用

### FR3: 権限チェックラッパー関数の削除

`stock-tracker` の `checkPermission()` は `libs/common` の `hasPermission()` の
単純なラッパーであるため削除し、直接呼び出しに変更する。

- 対象: `services/stock-tracker/core/src/services/auth.ts` の `checkPermission()`
- 変更: 呼び出し側で `libs/common` の `hasPermission()` を直接使用

### FR4: セッション取得関数の共通化

複数の Web サービスで重複する `getSession()` 実装を `libs/browser` に統合する。

- 対象: `services/admin/web/src/lib/auth/session.ts`
- 対象: `services/auth/web/src/lib/auth/session.ts`
- 対象: `services/niconico-mylist-assistant/web/src/lib/auth/session.ts`
- 対象: `services/share-together/web/src/lib/auth/session.ts`
- 統合先: `libs/browser/src/` 配下の新規モジュール

## 非機能要件

### NFR1: 依存関係ルールの遵守

既存の依存関係方向性を維持する。

```
ui → browser → common
web/batch → core → common
nextjs → aws
```

- `libs/common` はフレームワーク非依存の実装のみ追加
- ブラウザ環境依存の関数は `libs/browser` に配置
- `libs/aws` は AWS SDK を使用する実装のみ

### NFR2: テストカバレッジの維持

- `libs/common` の変更後もカバレッジ 80% 以上を維持
- 追加される共通関数には対応するユニットテストを作成
- 既存サービスのテストが引き続き通過すること

### NFR3: 後方互換性の確保

- 既存サービスのビルドが壊れないよう段階的に移行
- `libs/common` への追加は既存の export を変更しない
- 各サービスの import パスを変更する際は型の互換性を確認

### NFR4: TypeScript strict mode の遵守

- すべての変更が TypeScript strict mode でコンパイル可能
- 型の不一致による暗黙的な `any` を使用しない

## 優先度分類

### 高優先度（Phase 1 で実施）

| ID | 内容 | 対象ファイル |
|----|------|------------|
| FR1 | Web Push 設定関数の共通化 | stock-tracker/batch, niconico-mylist-assistant/batch |
| FR2 | User 型定義の統一 | auth/core |
| FR3 | 権限チェックラッパーの削除 | stock-tracker/core |

### 中優先度（Phase 2 で実施）

| ID | 内容 | 対象ファイル |
|----|------|------------|
| FR4 | セッション取得関数の共通化 | admin/web, auth/web, niconico-mylist-assistant/web, share-together/web |

## 対応しない項目

以下は正当な分散実装のため、対応不要と判断する：

- 各サービスのビジネスエンティティ型（`Holding`, `Alert`, `Video` など）
- 各サービスのマッパー実装
- 各サービス固有のバリデーター
- サービス固有のエラーメッセージ定義（`COMMON_ERROR_MESSAGES` 継承パタームは維持）

## 受け入れ条件

1. Phase 1 対象の重複実装が削除され、共通ライブラリを参照している
2. 全サービスのビルドが成功する
3. 全サービスのテストが通過する
4. `libs/common` のテストカバレッジが 80% 以上である
5. 依存関係ルールに違反した import がない
