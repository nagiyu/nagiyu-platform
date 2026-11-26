---
sources:
  - infra/admin/lib/dynamodb-stack.ts
  - services/admin/core/src/notify/subscription-mapper.ts
  - services/admin/core/src/notify/subscription-repository.ts
  - services/admin/core/src/notify/subscription-types.ts
  - libs/aws/src/dynamodb/store/dynamodb-entity-store.ts
  - libs/common/src/push-subscription/subscription-id.ts
sources_hash: a49183489201698a61520fc24d9175290639073a664ae862066c0c04adc30e17
---

# Admin のテーブル

Admin が持つ、Web Push の購読を保存する DynamoDB のテーブル。購読 1 件が 1 項目で、ブラウザの送信先 (endpoint) と暗号鍵、最後に登録した利用者の ID を持つ。Web が書き、Web と stream-handler が読む。

## テーブル

| 項目 | 内容 |
|---|---|
| 名前 | `nagiyu-admin-main-{env}` (`{env}` は `dev` か `prod`) |
| 課金 | オンデマンド |
| 暗号化 | AWS 管理のキー |
| バックアップ | ポイントインタイムリカバリを有効にする |
| 有効期限 (TTL) | なし |

| 環境 | スタックを削除したときのテーブル |
|---|---|
| dev | 削除する |
| prod | 残す |

- 名前は[Web の実行環境](../resource/web-runtime.md)と[バッチの実行環境](../resource/batch-runtime.md)の環境変数 `DYNAMODB_TABLE_NAME` で渡す
- prod は、スタックを削除してもテーブルとデータが残る。テーブルの名前は固定なので、残ったテーブルがあるままスタックを作り直すと、名前が衝突して失敗する。dev は、スタックを削除するとデータも消える
- スタックは `NagiyuAdminInfra{Env}`。タグは `Application` が `nagiyu`、`Service` が `admin`、`Environment` が環境名

## キー設計

| 種類 | 属性 | 値 |
|---|---|---|
| パーティションキー | `PK` | `SUBSCRIPTION#{購読 ID}` |
| ソートキー | `SK` | `SUBSCRIPTION#{購読 ID}` (`PK` と同じ値) |

| インデックス | パーティションキー | ソートキー | 射影 | 用途 |
|---|---|---|---|---|
| `UserIndex` | `GSI1PK` (`USER#{利用者 ID}`) | `GSI1SK` (`SUBSCRIPTION#{購読 ID}`) | すべての属性 | 利用者から購読を引く (このサービスのコードは使わない) |
| `EndpointIndex` | `GSI2PK` (`ENDPOINT#{endpoint の SHA-256}`) | `GSI1SK` | すべての属性 | endpoint から購読を引く |

どの取得に使うか。

| 取得 | 方法 |
|---|---|
| 通知のときの送り先 (購読の全件) | テーブル全体の Scan。`Type` が `Subscription` のものに絞る |
| 購読の登録 | `PK` と `SK` を指定した PutItem (条件なし)。同じ endpoint は同じ購読 ID になり、項目が丸ごと上書きされる。登録のたびに `CreatedAt` と `UpdatedAt` は登録した時刻に、`UserID` は登録した利用者になる |
| 購読の削除 (endpoint から) | `EndpointIndex` の Query で `GSI2PK` が一致する項目を引き、その `PK` と `SK` で DeleteItem |

- 購読 ID は endpoint から決まる。endpoint の長さがパーティションキーの上限を超えないよう、`GSI2PK` には endpoint そのものでなく SHA-256 のハッシュを入れる
- `UserIndex` を持つが、コードは `GSI1PK` を書くだけで、`UserIndex` を使う取得はない。利用者を指定した購読の取得や削除はない
- 1 テーブルに Push の購読の項目だけを置く。`PK` / `SK` の形をとるが、ほかの種類の項目は混在しない
- 読むときは、現在の名前の属性がなければ、旧い形式の属性名 (先頭が小文字の `subscriptionId` など) と、ISO 文字列の時刻も受け付ける。新しい名前と旧い名前が併存するときは、新しい名前を優先する

## 項目

日時はエポックミリ秒の数値。`PK`・`SK`・`GSI1PK`・`GSI1SK`・`GSI2PK` は上のキー設計のとおり。

| 項目 | 型 | 意味 |
|---|---|---|
| `Type` | 文字列 | 常に `Subscription`。購読だけを Scan で絞るのに使う |
| `SubscriptionID` | 文字列 | 購読の ID。endpoint から決まる。旧名 `subscriptionId` |
| `UserID` | 文字列 | 最後に登録した利用者の ID。空にできない。旧名 `userId` |
| `Endpoint` | 文字列 | ブラウザの Push の送信先の URL。空にできない。旧名 `endpoint` |
| `P256dhKey` | 文字列 | 通知の暗号化に使う、ブラウザの公開鍵。空にできない。旧名 `p256dhKey` |
| `AuthKey` | 文字列 | 通知の暗号化に使う、ブラウザの認証用の秘密。空にできない。旧名 `authKey` |
| `CreatedAt` | 数値 | 最後に登録した日時。登録のたびに、`UpdatedAt` と同じ値になる。旧名 `createdAt` (旧形式は ISO 文字列) |
| `UpdatedAt` | 数値 | 書き込みのたびに更新する日時。旧名 `updatedAt` (旧形式は ISO 文字列) |

- 読めない項目 (必須の属性が欠けている、空など) は、通知の送り先から除く。1 件が壊れていても、ほかの購読への送信は止まらない。件数と理由 (先頭の 10 件まで) をエラーログに出す
- 読み書きする主体と権限は[Web の実行環境](../resource/web-runtime.md)と[バッチの実行環境](../resource/batch-runtime.md)にある。購読を作るのは Web。消すのは、利用者の解除 (`DELETE /api/notify/subscribe`) を受けた Web と、送信で無効と分かった購読を消す Web と stream-handler ([Web Push の購読](../term/push-subscription.md)、[Push 購読 API](../api/notify.md))

## 理由

- 通知のときに購読を全件 Scan で読むのは、送り先が Admin の購読だけで、利用者や権限で絞らないため。絞らない読み方には、インデックスで引く利点がない。件数が増えると、この読み方は件数に比例して重くなる
