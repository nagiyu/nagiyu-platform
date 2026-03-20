# 一時アラート失効バッチ バグ修正 - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/services/stock-tracker/architecture.md に ADR として抽出し、
    tasks/issue-2329-temporary-alert-expiry-batch/ ディレクトリごと削除します。

    入力: tasks/issue-2329-temporary-alert-expiry-batch/requirements.md
    次に作成するドキュメント: tasks/issue-2329-temporary-alert-expiry-batch/tasks.md
-->

## 根本原因

### エラー発生箇所と原因の連鎖

```
temporary-alert-expiry.ts（handler）
  └─ alertRepo.getByFrequency('MINUTE_LEVEL')
        └─ mapper.toEntity(item) ← 各アイテムに対して呼び出し
              └─ validateSubscription(item)
                    └─ validateStringField(item.SubscriptionEndpoint, 'SubscriptionEndpoint')
                          └─ InvalidEntityDataError をスロー
        └─ DatabaseError でラップして再スロー
  └─ handler の外側 try-catch が捕捉 → statistics が全て 0 のまま 500 レスポンス
```

**エラーメッセージ**:
`データベースエラーが発生しました: エンティティデータが無効です: フィールド "SubscriptionEndpoint" が文字列ではありません`

### 不正データの状況

以下のいずれかに該当する DynamoDB アイテムが存在している。

1. `subscription` フィールドが存在しない（`isSubscriptionRecord` が false を返す）
2. かつ `SubscriptionEndpoint` フィールドが文字列ではない（未定義・null・非文字列型）

この状態は、サブスクリプション形式の移行期（旧形式 → 新形式）に発生したデータ不整合、
または subscription 追加以前に作成されたレガシーアイテムにより生じている可能性が高い。

### 副次的な問題

`getByFrequency` はデフォルト 50 件のみ取得する（ページネーションなし）。
アラート件数が 50 件を超えた場合、余剰アラートは処理されない潜在的バグが存在する。

---

## API 仕様

バッチ処理のため外部公開エンドポイントなし。

---

## データモデル

### 論理モデル（変更なし）

`AlertEntity` の型定義は変更しない。`subscription` フィールドは必須のまま維持する。

### 物理モデル（変更なし）

DynamoDB スキーマ・GSI 設計の変更は行わない。

---

## コンポーネント設計

### パッケージ責務分担

| パッケージ | 責務 |
| --------- | ---- |
| `stock-tracker/core` | AlertMapper の `validateSubscription` は変更しない |
| `stock-tracker/batch` | `temporary-alert-expiry.ts` でアイテム単位の不正データ耐性を追加する |

### 修正方針

**方針A: `getByFrequency` をアイテム単位でエラー耐性化する（採用）**

`DynamoDBAlertRepository.getByFrequency` のマッピング処理を、アイテム単位で
`InvalidEntityDataError` を捕捉してスキップ・ログ出力するよう修正する。

- `mapper.toEntity` が `InvalidEntityDataError` を throw した場合、該当アイテムをスキップする
- スキップしたアイテムの `PK`・`SK` をワーニングとしてログ出力する
- `getByFrequency` の戻り値は有効アイテムのみを含む `PaginatedResult<AlertEntity>` とする

**方針B: `temporary-alert-expiry.ts` でエラー全体をハンドリングする（不採用）**

バッチハンドラーで `DatabaseError` を捕捉してリトライする方針は、同一の無効アイテムが
毎回エラーを発生させるため根本解決にならない。

**ページネーション対応**

`temporary-alert-expiry.ts` の `handler` を、`getByFrequency` の
`nextCursor` が存在する間ループして全件取得するよう修正する。

### 実装モジュール一覧

**core**

| モジュール | パス | 変更内容 |
| --------- | ---- | -------- |
| `DynamoDBAlertRepository` | `core/src/repositories/dynamodb-alert.repository.ts` | `getByFrequency` のマッピング処理にアイテム単位エラー耐性を追加 |

**batch**

| モジュール | パス | 変更内容 |
| --------- | ---- | -------- |
| `handler` | `batch/src/temporary-alert-expiry.ts` | `getByFrequency` の全件取得ループを追加（ページネーション対応） |

### モジュール間インターフェース

`getByFrequency` のシグネチャ・戻り値型は変更しない。
不正アイテムをスキップした場合は `items` に含めないのみ。

---

## 実装上の注意点

### 依存関係・前提条件

- `InvalidEntityDataError` は `@nagiyu/aws` から import する
- `DatabaseError` との区別に注意する（`DatabaseError` は DynamoDB SDK エラー由来、`InvalidEntityDataError` はマッピング失敗由来）
- `getByFrequency` の変更は `minute.ts`・`hourly.ts` などの他のバッチ呼び出し元にも影響するため、既存の動作を維持すること

### ページネーションループの注意点

- 無限ループ防止のため、最大ページ数に上限を設ける（上限: 20 ページ）
- 上限超過時はワーニングをログ出力して処理済み分を返す（サイレント打ち切り禁止）
- `nextCursor` がなくなるまでループする設計だが、大量データ時の Lambda タイムアウトに注意する

### セキュリティ考慮事項

- ログに `SubscriptionEndpoint` などの個人情報を含めない
- スキップ時のログは `PK`・`SK`（または `AlertID`・`UserID`）のみ記録する

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `docs/services/stock-tracker/requirements.md` に統合すること：
      UC-002（不正データのスキップ）を一時アラート失効バッチの振る舞いとして追記する
- [ ] `docs/services/stock-tracker/architecture.md` に ADR として追記すること（重要な設計決定があれば）：
      repository 層のバルク取得メソッドは `InvalidEntityDataError` をアイテム単位で吸収する設計方針を記録する
