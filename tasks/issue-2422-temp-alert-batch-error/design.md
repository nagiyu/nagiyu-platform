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
per-item エラーハンドリングが実装されている（commit `23cad6c9`）：

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

このコードは既に master に含まれ Lambda にデプロイ済みであるにもかかわらず、
バッチは依然失敗している。ローカルの標準 ESM 環境では `instanceof` は正常に機能する。

### 根本原因

本リポジトリは全パッケージが `"type": "module"` の純粋 ESM であり、CJS 混在は発生しない。
`instanceof InvalidEntityDataError` が Lambda 環境のみで失敗するのは、
**Docker コンテナ内でのモジュール二重ロード**が原因である。

`services/stock-tracker/batch/Dockerfile` ランタイムステージで以下が行われる：

```dockerfile
# node_modules をコピー（シンボリックリンクを実体に展開してコピー）
COPY --from=builder /app/node_modules ./node_modules

# libs/aws の dist も別途コピー
COPY --from=builder /app/libs/aws/dist ./libs/aws/dist
```

Docker `COPY` はディレクトリ外へのシンボリックリンクを追跡して実コンテンツをコピーする。
`node_modules/@nagiyu/aws` は `../../libs/aws` へのシンボリックリンクであるため、
コンテナ内に同一ファイルが 2 か所に存在する：

| パス | 由来 |
| ---- | ---- |
| `node_modules/@nagiyu/aws/dist/src/dynamodb/errors.js` | COPY がシンボリックリンクを追跡してコピー |
| `libs/aws/dist/src/dynamodb/errors.js` | 明示的な COPY で別途コピー |

Node.js ESM のモジュールキャッシュはファイルの URL（パス）ベースであるため、
この 2 つは **別モジュールインスタンス** として扱われる。

Lambda ランタイムが `@nagiyu/aws` を `node_modules/@nagiyu/aws/...` 経由でロードするか
`libs/aws/...` 経由でロードするかが呼び出しルートによって異なる場合、
`validateStringField`（`validators.js` 内）が生成する `InvalidEntityDataError` と
`dynamodb-alert.repository.ts` が比較する `InvalidEntityDataError` が
異なるインスタンスとなり、`instanceof` が `false` を返す。

### 根本的な解決策と短期的な対処

**根本解決**: Dockerfile のランタイムステージから `libs/*/dist` および
`services/stock-tracker/core/dist` の明示的な COPY 行を削除する。

Docker BuildKit はデフォルトでシンボリックリンクを追跡して実体コピーするため、
`COPY --from=builder /app/node_modules ./node_modules` の時点で
`node_modules/@nagiyu/aws/dist/...` に実体がコピーされている。
この状態で `libs/aws/dist` を別途コピーすると同じファイルが 2 か所に存在することになる。
`libs/*/dist` の COPY 行を削除すれば `node_modules/@nagiyu/aws` の単一パスのみで
モジュールが解決され、二重ロードが解消する。

**短期的な対処**: `instanceof InvalidEntityDataError` を
`error instanceof Error && error.name === 'InvalidEntityDataError'` に変更する。
`error.name` は文字列比較であり、モジュールインスタンスに依存しない。
また `InvalidEntityDataError` は `this.name = 'InvalidEntityDataError'` を設定済みである。

本タスクでは短期対処を実施し、根本解決（Dockerfile の COPY 行削除）は別 Issue で管理する。

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
      Lambda + npm workspaces の Dockerfile では `libs/*/dist` の明示的 COPY は
      `node_modules` 内のシンボリックリンク実体コピーと二重になるため不要であること、
      および短期対処として `error.name` 比較を使用する方針
