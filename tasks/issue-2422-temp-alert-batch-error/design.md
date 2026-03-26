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

### 解決策

Dockerfile のランタイムステージから `libs/*/dist` および
`services/stock-tracker/core/dist` の明示的な COPY 行を削除する。

Docker BuildKit はデフォルトでシンボリックリンクを追跡して実体コピーするため、
`COPY --from=builder /app/node_modules ./node_modules` の時点で
`node_modules/@nagiyu/aws/dist/...` に実体がコピーされている。
この状態で `libs/aws/dist` を別途コピーすると同じファイルが 2 か所に存在することになる。
`libs/*/dist` の COPY 行を削除すれば `node_modules/@nagiyu/aws` の単一パスのみで
モジュールが解決され、二重ロードが解消する。既存の `instanceof InvalidEntityDataError`
判定はそのまま正常動作する。

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
| `stock-tracker/batch` | Dockerfile のランタイムステージから不要な COPY 行を削除 |

### 修正対象

`services/stock-tracker/batch/Dockerfile` のランタイムステージ。

変更前：
```dockerfile
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/libs/aws/dist ./libs/aws/dist
COPY --from=builder /app/libs/common/dist ./libs/common/dist
COPY --from=builder /app/services/stock-tracker/core/dist ./services/stock-tracker/core/dist
# ... 他の libs/*/dist 行
```

変更後：
```dockerfile
COPY --from=builder /app/node_modules ./node_modules
# libs/*/dist および services/*/dist の COPY 行を削除
# node_modules/@nagiyu/* は node_modules コピー時にシンボリックリンクが実体に展開済み
```

### 他サービスへの波及確認

`services/stock-tracker/batch/Dockerfile` 以外のサービス Dockerfile にも
同様の `libs/*/dist` 明示的 COPY が存在する場合は同様に削除する。

---

## 実装上の注意点

### 依存関係・前提条件

- `node_modules/@nagiyu/aws` は `../../libs/aws` へのシンボリックリンクであり、
  BuildKit が実体コピーするため `libs/aws/dist` の明示的 COPY は不要

### パフォーマンス考慮事項

- Dockerfile 変更のみのため、アプリケーションのパフォーマンスへの影響なし
- コンテナイメージサイズは減少する可能性がある（重複ファイルがなくなるため）

### セキュリティ考慮事項

- Dockerfile 変更のみであり、認可・入力バリデーションへの影響なし

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `docs/services/stock-tracker/requirements.md` に統合すること：
      不正データのスキップ処理（F-001, F-002）
- [ ] `docs/services/stock-tracker/architecture.md` に ADR として追記すること：
      Lambda + npm workspaces の Dockerfile では `libs/*/dist` の明示的 COPY は
      `node_modules` 内のシンボリックリンク実体コピーと二重になるため不要であること
