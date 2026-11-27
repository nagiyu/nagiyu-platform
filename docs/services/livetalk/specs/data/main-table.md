---
sources:
  - infra/livetalk/lib/dynamodb-stack.ts
  - infra/common/src/utils/naming.ts
  - services/livetalk/core/src/mappers/keys.ts
  - services/livetalk/core/src/constants.ts
  - services/livetalk/core/src/lib/chat-guard-window.ts
  - libs/common/src/format/jst-period.ts
  - services/livetalk/core/src/repositories/dynamodb-account-deletion.repository.ts
  - services/livetalk/core/src/repositories/dynamodb-chat-guard.repository.ts
  - services/livetalk/core/src/repositories/chat-guard-counting.ts
  - services/livetalk/core/src/repositories/study-usage-counting.ts
  - services/livetalk/core/src/mappers/profile.mapper.ts
  - services/livetalk/core/src/mappers/character-state.mapper.ts
  - services/livetalk/core/src/mappers/lifecycle.mapper.ts
  - services/livetalk/core/src/mappers/message.mapper.ts
  - services/livetalk/core/src/mappers/topic.mapper.ts
  - services/livetalk/core/src/mappers/self-fact.mapper.ts
  - services/livetalk/core/src/mappers/web-fact.mapper.ts
  - services/livetalk/core/src/mappers/note.mapper.ts
  - services/livetalk/core/src/mappers/note-skip.mapper.ts
  - services/livetalk/core/src/mappers/exploration.mapper.ts
  - services/livetalk/core/src/mappers/webraw.mapper.ts
  - services/livetalk/core/src/mappers/consolidation-cursor.mapper.ts
  - services/livetalk/core/src/mappers/freshness-check-request.mapper.ts
  - services/livetalk/core/src/mappers/study-topic.mapper.ts
  - services/livetalk/core/src/mappers/safety-event.mapper.ts
  - services/livetalk/core/src/mappers/notification-event.mapper.ts
  - services/livetalk/core/src/mappers/push-subscription.mapper.ts
sources_hash: 821b7f197de95b3d6c1eb2b012778710bd8f05e02e661c484bad1568b07b95b0
---

# LiveTalk のテーブル

LiveTalk のデータをすべて保存する DynamoDB の 1 つのテーブル。利用者ごとのプロフィール・キャラクターの状態・会話・話題・ノート・通知・セーフティの記録などを、キーの形で分けて入れる。パーティションキーは、どの種類も利用者の ID である。

## テーブル

| 項目 | 内容 |
|---|---|
| 名前 | `nagiyu-livetalk-dynamodb-{env}` (`{env}` は `dev` か `prod`) |
| 課金 | オンデマンド |
| 暗号化 | AWS 管理のキー |
| バックアップ | ポイントインタイムリカバリを有効にする |
| 有効期限 (TTL) | 属性 `TTL` (エポック秒)。持つ種類は下の「項目」 |

| 環境 | スタックを削除したときのテーブル |
|---|---|
| dev | 削除する |
| prod | 残す |

- スタックは `NagiyuLiveTalkDynamoDB{Env}` (`{Env}` は `Dev` か `Prod`)。タグは `Application` が `nagiyu`、`Environment` が環境名、`ManagedBy` が `CDK`、`Component` が `livetalk`
- 名前は[Web の実行環境](../resource/web-runtime.md)と[バッチの実行環境](../resource/batch-runtime.md)の環境変数 `DYNAMODB_TABLE_NAME` で渡す。ARN とテーブルの名前は、どのスタックも `infra/common` の命名の関数 (`getDynamoDBTableName`、`getDynamoDBTableArn`) で、独立に組み立てる
- Entity の読み書きの部品は、[EntityStore](../../../../platform/specs/lib/aws/entity-store.md)と [EntityMapper](../../../../platform/specs/lib/aws/entity-mapper.md)、回数の数え方は[回数カウンター](../../../../platform/specs/lib/aws/usage-counter.md)にある

## キー設計

### 主キー

| 属性 | 値 |
|---|---|
| パーティションキー `PK` | `USER#{利用者 ID}` (どの種類も同じ) |
| ソートキー `SK` | 種類ごとの形 (下の表) |

`{c}` は[キャラクター](../term/character.md)の ID、`{t}` は話題の ID。

| 種類 | `Type` | `SK` |
|---|---|---|
| プロフィール | `Profile` | `PROFILE` |
| キャラクターの状態 (親密度など) | `CharacterState` | `CHAR#{c}#STATE` |
| [lifecycle](../term/lifecycle.md) | `Lifecycle` | `CHAR#{c}#LIFECYCLE` |
| メッセージ | `Message` | `CHAR#{c}#MSG#{ULID}` |
| [Topic](../term/topic.md) のヘッダ | `Topic` | `CHAR#{c}#TOPIC#{t}#META` |
| [SELF fact](../term/self-fact.md) | `SelfFact` | `CHAR#{c}#TOPIC#{t}#SELF#{ULID}` |
| [WEB fact](../term/web-fact.md) | `WebFact` | `CHAR#{c}#TOPIC#{t}#WEB#{ULID}` |
| [ノート](../term/note.md) | `Note` | `CHAR#{c}#NOTE#{ULID}` |
| ノートの見送りの記録 | `NoteSkip` | `CHAR#{c}#NOTESKIP#{t}` |
| [探索の記録](../term/exploration.md) | `Exploration` | `CHAR#{c}#EXPLORE#{t}` |
| [WebRaw](../term/webraw.md) | `WebRaw` | `CHAR#{c}#WEBRAW#{ULID}` |
| 集約のカーソル | `ConsolidationCursor` | `CHAR#{c}#CURSOR` |
| [鮮度確認の依頼](../term/freshness-check-request.md) | `FreshnessCheckRequest` | `CHAR#{c}#FRESHCHECK#{t}` |
| [勉強の依頼](../term/study-topic.md) | `StudyTopic` | `CHAR#{c}#STUDY#{t}` |
| 勉強の 1 日の回数 | `StudyUsage` | `STUDYUSAGE#{YYYYMMDD}` |
| [セーフティ](../term/safety.md)の検出の記録 | `SafetyEvent` | `SAFETY#{ULID}` |
| [通知の記録](../term/notification-event.md) | `NotificationEvent` | `NOTIF#{ULID}` |
| Push の購読 | `PushSubscription` | `PUSH_SUBSCRIPTION#{購読 ID}` |
| チャットのレート制限の回数 | `ChatRateLimit` | `RATELIMIT#{1m または 1h}#{窓の番号}` |
| チャットのロック | なし | `CHATLOCK` |

- 1 つの話題の ヘッダ・SELF fact・WEB fact は、同じ `CHAR#{c}#TOPIC#{t}#` の接頭辞で束ねる。この接頭辞の `begins_with` で、1 回の Query で 1 話題をまとめて取れる
- 話題の束の外に置くもの (`NOTESKIP`、`EXPLORE`、`FRESHCHECK`) がある。束の `begins_with` に混ざらないようにするため
- `STUDYUSAGE` の日は日本時間の暦日。キャラクター別の回数 (`Count#{c}`) と、利用者の合計 (`Count#total`) を、1 つの項目の属性に持つ
- `RATELIMIT` の窓の番号は、`1m` ならエポック分、`1h` ならエポック時 (`Count` を数える)
- 退会したあとの SafetyEvent は、`UserID` が `ANON#{ULID}` に置き換わり、`PK` が `USER#ANON#{ULID}` に付け替わる ([アカウント API](../api/account.md))

### インデックス

| インデックス | パーティションキー | ソートキー | 射影 | 対象 |
|---|---|---|---|---|
| `GSI1` | `GSI1PK` = `PROFILE` | `GSI1SK` = 利用者の ID (`USER#` なし) | キーだけ (`KEYS_ONLY`) | プロフィールだけ (sparse) |
| `GSI2` | `GSI2PK` = `SAFETY` | `GSI2SK` = 検出の ID (`EventID`。ULID) | 一部の属性 (`INCLUDE`) | SafetyEvent だけ (sparse) |
| `GSI3` | `GSI3PK` = `{c}#TOPICS#{利用者 ID}` | `GSI3SK` = `Care` (数値) | 一部の属性 (`INCLUDE`) | Topic のヘッダだけ (sparse) |

射影する属性 (キー以外)。

| インデックス | 属性 |
|---|---|
| `GSI2` | `UserID`、`EventID`、`CharacterID`、`Trigger`、`DetectedPattern`、`CreatedAt` |
| `GSI3` | `UserID`、`CharacterID`、`TopicID`、`Subject`、`CanonicalSummary`、`Category`、`Embedding`、`CreatedAt`、`UpdatedAt` |

どの取得に使うか。

| 取得 | 方法 |
|---|---|
| 全利用者の列挙 (バッチ) | `GSI1` を `GSI1PK` = `PROFILE` で Query する |
| キャラクターの直近のメッセージ | `PK` と、`SK` が `CHAR#{c}#MSG#` で始まるものの Query (新しい順に、トークンの上限と件数の上限まで) |
| 全利用者の SafetyEvent を新しい順に | `GSI2` を `GSI2PK` = `SAFETY` で Query する。本文が要るときだけ、ベーステーブルの `PK` と `SK` で引く |
| 1 キャラクター分の Topic のヘッダの全件 | `GSI3` を `GSI3PK` で Query する |
| 注目度 (`Care`) の高い Topic | `GSI3` を `GSI3PK` で、`GSI3SK` の降順に Query する |
| 1 話題の SELF fact と WEB fact | `PK` と、`SK` が `CHAR#{c}#TOPIC#{t}#` で始まるものの Query |

- `GSI3` に射影しない `RequestText` と `RequestedAt` (依頼に由来する話題のフック) は、ベーステーブルを読むときだけ使う。`GSI3` だけでは、Topic のヘッダを完全には復元できない
- ヘッダの `SK` は `META` で終わるので、`begins_with` では、ヘッダだけを列挙できない。ヘッダの列挙は、必ず `GSI3` を通す

## 項目

日時はエポックミリ秒の数値。表に書かない `PK`・`SK`・`Type`・`GSI*` は、上のキー設計のとおり。項目の意味は、種類ごとの用語の仕様にある。

### 多くの種類にある属性

| 項目 | 型 | 意味 |
|---|---|---|
| `CreatedAt` | 数値 | 作った日時 |
| `UpdatedAt` | 数値 | 書き込みのたびに更新する日時。mapper が書かない種類にも、store が必ず `UpdatedAt` を足す ([EntityStore](../../../../platform/specs/lib/aws/entity-store.md))。持たないのは、回数 (`StudyUsage`、`ChatRateLimit`) とロックだけ |
| `TTL` | 数値 | 有効期限 (エポック秒)。持つ種類は下の表 |

### 種類ごとの属性

| 種類 | 属性 |
|---|---|
| プロフィール | `UserID`、`LastActiveAt`、`Consents` (規約・プライバシーポリシーの同意と年齢の確認。`Version` と `AgreedAt` を持つ) |
| キャラクターの状態 | `UserID`、`CharacterID`、`LastInteractionAt`、`AffectionLevel` |
| lifecycle | `UserID`、`CharacterID`、`Bedtime`、`WakeUpTime`、`UserActivityProfile` (任意) |
| メッセージ | `UserID`、`CharacterID`、`MessageID`、`Role`、`Text` |
| Topic | `UserID`、`CharacterID`、`TopicID`、`Subject`、`CanonicalSummary`、`Category`、`Care`、`Embedding`、`RequestText` と `RequestedAt` (任意) |
| SELF fact | `UserID`、`CharacterID`、`TopicID`、`FactID`、`Text`、`Provenance` |
| WEB fact | `UserID`、`CharacterID`、`TopicID`、`FactID`、`Text`、`SourceUrls`、`Volatility`、`ObservedAt`、`NextReview` (任意) |
| ノート | `UserID`、`CharacterID`、`NoteID`、`TopicID`、`Subject`、`Headline`、`Reaction` (任意) |
| ノートの見送りの記録 | `UserID`、`CharacterID`、`TopicID`、`DecidedAt` |
| 探索の記録 | `UserID`、`CharacterID`、`TopicID`、`ExploredAt`、`RecentAngles` |
| WebRaw | `UserID`、`CharacterID`、`RawID`、`Query`、`RawText`、`SourceUrls`、`Origin`、`RequestText` と `RequestedAt` (任意) |
| 集約のカーソル | `UserID`、`CharacterID`、`MsgCursor`、`WebrawCursor` |
| 鮮度確認の依頼 | `UserID`、`CharacterID`、`TopicID` |
| 勉強の依頼 | `UserID`、`CharacterID`、`TopicID`、`Topic`、`Priority`、`Status` |
| セーフティの検出の記録 | `UserID`、`EventID`、`CharacterID` (任意)、`Trigger`、`DetectedPattern`、`InputText`、`ResponseText`、`ModerationCategories` (任意) |
| 通知の記録 | `UserID`、`NotifID`、`CharacterID`、`Kind`、`Title`、`Body`、`TopicID`・`EventDate`・`SuggestedReply`・`ConsumedAt` (任意) |
| Push の購読 | `UserID`、`SubscriptionID`、`Endpoint`、`P256dhKey`、`AuthKey` |
| チャットのレート制限 | `Count` |
| チャットのロック | `OwnerToken`、`ExpiresAt`、`TTL` |

### 有効期限 (TTL)

| 種類 | 有効期限 |
|---|---|
| メッセージ | 作ってから 90 日 |
| WebRaw | 作ってから 90 日 |
| 通知の記録 | 作ってから 30 日 |
| 勉強の依頼 | 作ってから 30 日 |
| 鮮度確認の依頼 | 作ってから 7 日 |
| セーフティの検出の記録 | 検出から 3 年 (1,095 日)。退会で匿名化しても、期限は引き継ぐ |
| 勉強の 1 日の回数 | 日本時間のその日が終わった 1 日後 |
| チャットのレート制限 | `1m` の窓は、次の分の始まりの 120 秒後。`1h` の窓は、次の時の始まりの 7,200 秒後 |
| チャットのロック | ロックの期限 (600 秒) の 300 秒後 |

- 上にない種類 (プロフィール、キャラクターの状態、lifecycle、Topic の束、ノート、ノートの見送りの記録、探索の記録、集約のカーソル、Push の購読) は、有効期限を持たず、恒久である
- DynamoDB の TTL による削除は、期限から遅れることがある。ロックの失効は、`ExpiresAt` で判定し、TTL の削除には頼らない
- 退会のときは、`PK` の配下をすべて削除する。ただし SafetyEvent だけは、匿名の持ち主に付け替えて残す。`UserID` を `ANON#{ULID}` に置き換え、`PK` を `USER#ANON#{ULID}` に移す。付け替えても `GSI2` には載り続け、期限も引き継ぐ ([アカウント API](../api/account.md))

## 理由

- 会話は、1 メッセージを 1 つの項目にする。利用者ごとに 1 つの項目へ配列で持つ案は、DynamoDB のアンチパターンで、1 項目の上限 400 KB、書き込みの費用、並行の更新の競合、TTL が使えないことのために成り立たない。1 メッセージ 1 項目なら、メッセージの数に上限がなく、古いメッセージを TTL で自動で消せ、「直近の N 件」を Query と `Limit` で効率よく取れる。代償は、全件を読むには複数の項目の取得が要ることだが、LiveTalk では全件を読まない
- 利用者の列挙は、プロフィールだけを索引にする sparse な `GSI1` で行い、キーだけを射影する。テーブル全体を Scan して絞る方法は、メッセージなどの大量の項目が同居するので、利用者が増えるほど、費用と時間が線形に悪化し、Lambda の 15 分の上限に当たるおそれがあった。列挙に要るのは利用者の ID だけなので、属性を複製せず (`KEYS_ONLY`)、索引の保管と書き込みの費用を最小にする。列挙の処理は、複数のバッチで重複しないよう、`ProfileRepository.listAllUserIds` に集約する
- SafetyEvent を全利用者にわたって新しい順に見る手段が要るため、SafetyEvent だけを索引にする sparse な `GSI2` を持つ。`GSI2` に、本文 (`InputText`、`ResponseText`) を射影しない。横断のレビューは、メタデータだけでよく、本文は個人情報になりうるので、本文が要るときだけ、ベーステーブルを `PK` と `SK` で引く。`GSI2SK` が ULID なので、時系列の降順で最近の検出を取れる
- Topic のヘッダの列挙は、sparse な `GSI3` で行う。ヘッダの `SK` は `META` で終わり、`begins_with` では、ヘッダだけを取れないため。`GSI3` に、想起に使う埋め込み (`Embedding`) と、注目度 (`Care`) を載せるので、想起 (全 Topic の座標だけを読んで自前でコサイン類似度を求める) と、自発リサーチの選定 (`Care` の降順) のどちらも、Topic の本体を全部読まずに済む。`GSI3SK` を数値の `Care` にするのは、降順の Query と全件の列挙の両方を、1 つの索引で賄うため
- チャットのレート制限の項目の TTL には、窓の終わりのあとに余裕を加える。窓が終わった直後に項目が消えないようにするため
- 他のスタックは、このテーブルを CloudFormation の Export / Import や SSM では参照せず、名前と ARN を命名の関数で組み立てる。Export に依存すると、値が変わったときに、依存するスタックを連鎖して再デプロイしなければならなくなるため

## 手順

### インデックスを足す・変える

インデックスを足しても、そのインデックスを Query するロールは、すぐには使えない。次の 3 つを、1 つの変更で一緒に直す。

1. `infra/livetalk/lib/dynamodb-stack.ts` に、インデックスを足す
2. そのインデックスを Query する各ロールのテーブルの取り込みを、`Table.fromTableAttributes` に `globalIndexes` を付けた形にする。`fromTableArn` だけだと、権限に `table/.../index/*` が含まれず、`dynamodb:Query` が `AccessDenied` になる。権限は、テーブルを取り込むロールごとに付くので、取り込む場所を漏らさない。取り込む場所は、[Web の実行環境](../resource/web-runtime.md) (`infra/livetalk/lib/ecs-service-stack.ts`) と[バッチの実行環境](../resource/batch-runtime.md) (`infra/livetalk/lib/batch-stack.ts`) のスタック
3. Query の実装と、`services/livetalk/core/src/mappers/keys.ts` のインデックス名と射影の定数を、足す

- 射影の定数 (`PROFILE_GSI_PROJECTION`、`SAFETY_EVENT_GSI_PROJECTION`、`TOPIC_GSI_PROJECTION`) は、インメモリの実装が実際の射影の欠落を再現するために使う。テーブル定義と食い違うと、`services/livetalk/core/tests/contract/table-schema-drift.test.ts` が検知する。インデックスを足す・変えるときは、このテストも合わせて直す
