# Stock Tracker ティッカー一覧取得不具合の修正

## 概要

Stock Tracker において、ティッカー一覧が正しく全件取得できないバグを修正する。
DynamoDB の `ScanCommand` + `FilterExpression` に関する仕様上の問題と、
ページネーションの未実装（取得が1ページ目のみ）が原因である。

## 関連情報

- Issue: 未番号（タイトル: Stock Tracker のティッカーが一覧で取得できないことがある）
- タスクタイプ: サービスタスク（stock-tracker）

## 現象

1. **ティッカー管理画面**: 全てのティッカーが表示されないことがある。取引所フィルタを設定すると表示されていなかったティッカーも表示される。
2. **サマリー画面**: ティッカー名が取得できず、ティッカー ID がそのまま表示されるケースがある。

## 根本原因

### 原因 1: DynamoDB Scan + FilterExpression の Limit 仕様

`DynamoDBTickerRepository.getAll()` は `ScanCommand` に `Limit: 50`（デフォルト）と `FilterExpression: '#type = :type'` を設定している。

DynamoDB の仕様として、`ScanCommand` の `Limit` は **「スキャンするアイテム数の上限」** であり、**「返すアイテム数の上限」ではない**。
FilterExpression はスキャン後に適用されるため、Limit=50 でスキャンされた50件のうち `Type = 'Ticker'` に一致するものだけが返される。
その結果、実際の取得件数が50件を下回り、`LastEvaluatedKey` がある状態（後続ページが存在する状態）で処理が終わってしまう。

一方 `getByExchange()` は `QueryCommand` + GSI3 を使用しており、Query の Limit は「返すアイテム数の上限」として機能するため、フィルタリング後でも正確な件数が返る。これが「取引所フィルタをかけると正しく表示される」理由である。

### 原因 2: API 層でのページネーション未実装

`GET /api/tickers` の実装（`route.ts`）では、`tickerRepo.getAll()` または `tickerRepo.getByExchange()` を1回呼び出すのみで、`nextCursor`（後続ページが存在する場合に返る）を利用した後続ページの取得処理がない。
結果として、最大50件しか取得されない。

### 原因 3: サマリー画面での全件取得不足

`GET /api/summaries` の実装でも `tickerRepository.getAll()` を1回呼ぶのみで、全ティッカーを `tickerMap` に収めようとしているが、ページネーション処理がないため50件以上のティッカーがある場合に一部のティッカーが `tickerMap` から漏れる。
漏れたティッカーのサマリーは `ticker?.Name ?? summary.TickerID` のフォールバックにより TickerID がそのまま表示される。

## 要件

### 機能要件

- **FR1**: `DynamoDBTickerRepository.getAll()` において、`LastEvaluatedKey` が返る限り後続ページをループで取得し、全ティッカーを返せるよう修正する（または `Limit` を指定しないスキャンに変更する）
- **FR2**: `GET /api/tickers` において、全件取得時のページネーションを正しく機能させる
- **FR3**: `GET /api/summaries` において、`tickerRepository.getAll()` で全ティッカーを取得し `tickerMap` を完全に構築する
- **FR4**: ティッカー管理画面（UI）においても、ページネーション対応により全ティッカーを表示できるようにする

### 非機能要件

- **NFR1**: DynamoDB へのスキャン回数は最小限に抑える（不必要なスキャンループは避ける）
- **NFR2**: テストカバレッジ 80% 以上を維持する
- **NFR3**: 既存の API レスポンス形式は変更しない（後方互換性を維持する）

## 実装のヒント

### getAll() の修正方針

`getAll()` は「全件取得」を意図したメソッド名であるため、メソッド自体を `LastEvaluatedKey` がなくなるまでループする実装に修正する。
`PaginatedResult<T>` を返す既存のシグネチャ（ページネーションオプション対応）は **残しつつ**、オプション未指定時（または特定条件下）に全件を返すよう変更することで API 後方互換を維持する。

なお、`options` が指定された場合（`limit` や `cursor` あり）は従来通りのページネーション動作とし、`options` が指定されない場合に全件取得ループを行う設計が現実的。

**既存の参考実装**: `services/niconico-mylist-assistant/core/src/repositories/dynamodb-video.repository.ts` の `listAll()` メソッドに、`do-while` + `LastEvaluatedKey` を使った全件スキャンパターンが実装されている。また、`services/niconico-mylist-assistant/core/src/db/videos.ts` の `listVideosWithSettings()` でも同様のループが使用されている。これらを参考にする。

全件取得ループの概念（`do-while` パターン）:
```
アイテム配列 = []
exclusiveStartKey = undefined
do:
    結果 = scan(ExclusiveStartKey=exclusiveStartKey)
    アイテム配列 += 結果.Items
    exclusiveStartKey = 結果.LastEvaluatedKey
while exclusiveStartKey が存在する
```

### API 層の修正方針

`getAll()` が全件を返すよう修正されることで、呼び出し側の変更は最小限となる。

- `GET /api/tickers`（`route.ts`）: `tickerRepo.getAll()` を引数なしで呼び出すことで全件取得し、メモリ上でスライスするページネーションはそのまま維持する
- `GET /api/summaries`（`route.ts`）: `tickerRepository.getAll()` で全ティッカーを取得して `tickerMap` を完全構築する（既存の呼び出しコードの変更不要）

### summaries API の修正方針

`getAll()` の修正により、`tickerRepository.getAll()` が全件を返すようになるため、`tickerMap` の構築が自動的に正しく動作するようになる。

## タスク

### Phase 1: コア層の修正

- [ ] **T001**: `DynamoDBTickerRepository.getAll()` を、`options` 未指定時に `do-while` + `LastEvaluatedKey` ループで全件を取得する実装に変更する（`services/niconico-mylist-assistant/core/src/repositories/dynamodb-video.repository.ts` の `listAll()` を参考）
- [ ] **T002**: `InMemoryTickerRepository.getAll()` も全件を返すよう実装を合わせる
- [ ] **T003**: `getAll()` のユニットテストを修正・追加する（複数ページにまたがるシナリオのテストを含む）

### Phase 2: API 層の修正

- [ ] **T004**: `GET /api/tickers`（`services/stock-tracker/web/app/api/tickers/route.ts`）の動作を確認し、`getAll()` の修正で全件取得されることを確認する（API 呼び出し側のコード変更は不要なはずだが確認する）
- [ ] **T005**: `GET /api/summaries`（`services/stock-tracker/web/app/api/summaries/route.ts`）も同様に確認する
- [ ] **T006**: API 層のユニットテストを確認・修正する

### Phase 3: 動作確認とテスト

- [ ] **T007**: ティッカーが50件以上存在するシナリオのユニットテストを追加（複数ページにまたがるケース）
- [ ] **T008**: ビルドが通ることを確認（`npm run build --workspace=@nagiyu/stock-tracker-core`、`@nagiyu/stock-tracker-web`）
- [ ] **T009**: E2E テストがパスすることを確認

## 影響ファイル

| ファイル | 変更内容 |
|---------|---------|
| `services/stock-tracker/core/src/repositories/dynamodb-ticker.repository.ts` | `getAll()` を全件取得ループに変更 |
| `services/stock-tracker/core/src/repositories/in-memory-ticker.repository.ts` | `getAll()` を全件返却に合わせて修正 |
| `services/stock-tracker/core/tests/unit/repositories/dynamodb-ticker.repository.test.ts` | `getAll()` の複数ページシナリオテスト追加 |

## 参考ドキュメント

- `docs/development/rules.md` - コーディング規約
- `docs/development/architecture.md` - アーキテクチャ方針
- `services/stock-tracker/core/src/repositories/ticker.repository.interface.ts` - リポジトリインターフェース
- `services/stock-tracker/core/src/repositories/dynamodb-ticker.repository.ts` - DynamoDB 実装（修正対象）
- `services/stock-tracker/web/app/api/tickers/route.ts` - ティッカー API
- `services/stock-tracker/web/app/api/summaries/route.ts` - サマリー API
- `services/niconico-mylist-assistant/core/src/repositories/dynamodb-video.repository.ts` - `do-while` + `LastEvaluatedKey` 全件スキャンの参考実装（`listAll()` メソッド）
- `services/niconico-mylist-assistant/core/src/db/videos.ts` - `listVideosWithSettings()` での同パターン利用例

## 備考・未決定事項

- `getAll()` に `options` を渡した場合（`limit`/`cursor` あり）は従来通りのページネーション動作を維持するか、全件取得のみに統一するかは実装者の判断に委ねる。ただし既存テストへの影響を考慮し、シグネチャ変更は最小限にとどめること。
- 将来的にティッカー数が数千件を超える規模になった場合は、Scan ベースの全件取得からより効率的なアクセスパターンへの移行（例: GSI 活用）を検討する。
