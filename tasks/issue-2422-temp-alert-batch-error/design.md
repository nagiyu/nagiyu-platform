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

`InvalidEntityDataError` の判定を `instanceof` のみに依存させず、
`error.name` とメッセージ内容でも判定できるようにする。

実機検証では、Docker ランタイムで workspace symlink（`node_modules/@nagiyu/aws -> ../../libs/aws`）が
そのまま保持されるケースがあり、`libs/*/dist` の COPY を削除すると
`Cannot find module '/var/task/node_modules/@nagiyu/common/dist/src/index.js'` で起動不能になることを確認した。
そのため、Dockerfile の COPY 方針は維持しつつ、リポジトリ側で
モジュールインスタンス差異に耐性のあるエラー判定を実装する。

これにより、同名同等エラーが別モジュールインスタンス由来で発生しても
無効データをスキップしてバッチ処理を継続できる。

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
| `stock-tracker/core` | `DynamoDBAlertRepository` で無効データ判定を `instanceof` + `error.name` ベースに強化 |
| `stock-tracker/core/tests` | モジュール二重ロード相当（`name` 判定経由）のスキップ継続をユニットテストで担保 |

### 修正対象

- `services/stock-tracker/core/src/repositories/dynamodb-alert.repository.ts`
  - `isInvalidEntityDataError` ヘルパーを追加し、`instanceof InvalidEntityDataError` に加えて
    `error.name === 'InvalidEntityDataError'` かつメッセージ先頭一致で判定
- `services/stock-tracker/core/tests/unit/repositories/dynamodb-alert.repository.test.ts`
  - `AlertMapper` のスパイで `name` のみ一致するエラーを擬似的に発生させ、
    スキップ継続できることを検証

### 他サービスへの波及確認

`niconico-mylist-assistant/batch` など他サービスにも同様の Dockerfile パターンが存在するため、
Dockerfile 一律変更は別途、各サービスの実行検証とセットで実施する。
本タスクでは一時アラート失効バッチの障害回避に必要な最小修正として、コアリポジトリの判定強化に限定する。

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
