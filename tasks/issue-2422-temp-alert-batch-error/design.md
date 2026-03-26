# 一時アラート削除バッチ エラー修正 - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/services/stock-tracker/architecture.md に ADR として抽出し、
    tasks/issue-2422-temp-alert-batch-error/ ディレクトリごと削除します。

    入力: tasks/issue-2422-temp-alert-batch-error/requirements.md
    次に作成するドキュメント: tasks/issue-2422-temp-alert-batch-error/tasks.md
-->

## エラー原因の分析

### 現象

Lambda ログに以下のエラーが記録され、バッチ全体が失敗している。

```
データベースエラーが発生しました:
エンティティデータが無効です: フィールド "SubscriptionEndpoint" が文字列ではありません
```

統計情報は `totalAlerts: 0` であり、アラート取得フェーズ（`getAllAlertsByFrequency`）で
例外が発生している。

### コード上の期待動作と実際の動作の乖離

`DynamoDBAlertRepository.getByFrequency()` には DynamoDB Item を Entity に変換する
per-item エラーハンドリングが実装されている：

```
for (const item of result.Items || []) {
    try {
        items.push(this.mapper.toEntity(...));
    } catch (error) {
        if (error instanceof InvalidEntityDataError) {
            // スキップ（警告ログ出力）
            continue;
        }
        throw error;  // ← ここで re-throw される
    }
}
```

`AlertMapper.validateSubscription()` が `SubscriptionEndpoint` 非文字列時に
`InvalidEntityDataError` を throw するため、内側の catch が捕捉してスキップされるはずである。
しかし実際には `throw error` の経路を経て外側の catch に到達し、
`DatabaseError` でラップされて呼び出し元に伝播している。

### 根本原因

`error instanceof InvalidEntityDataError` の評価が `false` になっている。

ESM（ECMAScript Modules）/ CJS（CommonJS）混在環境において、同じクラス名でも
モジュールが別インスタンスとしてロードされた場合に `instanceof` が失敗することがある。
`@nagiyu/aws` はワークスペースパッケージであり、ビルド済みバイナリの解決パスによっては
`DynamoDBAlertRepository` と `validators.ts` が別々の `InvalidEntityDataError` クラスを
参照するケースが生じうる。

`error.name` は文字列比較であるため、モジュールインスタンスに依存せず動作する。

---

## API 仕様

外部公開 API の変更なし。Lambda Handler インターフェースは維持する。

---

## データモデル

変更なし。

---

## コンポーネント設計

### パッケージ責務分担

| パッケージ | 責務 |
| ---------- | ---- |
| `stock-tracker/core` | `DynamoDBAlertRepository` の per-item エラーハンドリング修正 |
| `stock-tracker/batch` | 変更なし（ただし修正後の動作確認テストを追加） |

### 実装モジュール一覧

**core**

| モジュール | パス | 役割 |
| ---------- | ---- | ---- |
| `DynamoDBAlertRepository` | `core/src/repositories/dynamodb-alert.repository.ts` | `getByFrequency` / `getByUserId` の per-item catch を修正 |

### 修正方針

`instanceof` によるクラス検査を `error.name` による文字列比較に変更する。

**変更箇所**: `DynamoDBAlertRepository` の `getByFrequency` および `getByUserId` 内の
per-item catch ブロック

変更前の判定：
```
if (error instanceof InvalidEntityDataError) { ... }
```

変更後の判定：
```
if (error instanceof Error && error.name === 'InvalidEntityDataError') { ... }
```

この変更により ESM/CJS 環境でのモジュールインスタンス差異に依存しない判定が可能になる。

### 他リポジトリへの影響

`DynamoDBHoldingRepository`、`DynamoDBTickerRepository` など、他の DynamoDB リポジトリに
同様の per-item エラーハンドリングが存在する場合は、同様に修正する。
（各リポジトリの `getByUserId` / `getAll` など一覧取得メソッドを確認する）

---

## 実装上の注意点

### 依存関係・前提条件

- `@nagiyu/aws` パッケージの `InvalidEntityDataError` は `error.name = 'InvalidEntityDataError'`
  を設定していること（`errors.ts` の `this.name = 'InvalidEntityDataError'` 確認済み）

### パフォーマンス考慮事項

- 文字列比較は `instanceof` と同等のパフォーマンスであり、影響なし

### セキュリティ考慮事項

- エラーハンドリングの変更であり、認可・入力バリデーションへの影響なし

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `docs/services/stock-tracker/requirements.md` に統合すること：
      不正データのスキップ処理（F-001, F-002）
- [ ] `docs/services/stock-tracker/architecture.md` に ADR として追記すること：
      ESM/CJS 混在環境における `instanceof` vs `error.name` の使い分け方針
