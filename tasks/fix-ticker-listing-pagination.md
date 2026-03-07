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

DynamoDB の `ScanCommand` で `FilterExpression` を使う場合、`Limit` を省略するか、`LastEvaluatedKey` がなくなるまでループしてページをすべて収集する「全件取得ループ」パターンが適切。

なお、`Limit` を省略すると DynamoDB は最大 1MB 分をスキャンして返すため、件数が多い場合はループが必要になる点は同様。ループ回数を減らしたい場合は、Limit を大きめ（例: 500 や 1000）に設定してループ回数を削減する方法もある。

全件取得ループの概念:
```
アイテム配列 = []
カーソル = undefined
繰り返し:
    結果 = scan(cursor=カーソル)
    アイテム配列 += 結果.items
    カーソル = 結果.nextCursor
    カーソルが undefined ならループ終了
```

### API 層のページネーション修正方針

2つのアプローチが考えられる:

**アプローチ A（推奨）: コア層に全件取得メソッドを追加**
- `TickerRepository` インターフェースに `getAllItems(): Promise<TickerEntity[]>` を追加し、内部でループ処理する
- `GET /api/tickers` のページネーションは引き続きメモリ上で行い、全件取得後にスライス
- `GET /api/summaries` はこの新メソッドを使い `tickerMap` を完全構築

**アプローチ B: API 層でカーソルベースの DynamoDB ページネーションを活用**
- `getAll(options)` の `cursor` を API 層で受け取り DynamoDB に転送する
- フロントエンドも DynamoDB カーソルを保持してページ送りを行う
- 実装コストが高く、Scan + FilterExpression での lastKey 互換性の問題もある

**アプローチ A が推奨**である理由:
- ティッカー数は数百件程度を想定しており、全件メモリ取得で十分な規模
- 既存の API レスポンス形式（`lastKey` によるメモリページネーション）を変更しなくて済む
- サマリー画面でも全件 tickerMap の構築が容易

### summaries API の修正方針

`getAllItems()` を使い、全ティッカーを一度に取得して `tickerMap` を構築する。

## タスク

### Phase 1: コア層の修正

- [ ] **T001**: `DynamoDBTickerRepository` に `getAllItems(): Promise<TickerEntity[]>` を実装する（ループで全ページを取得）
- [ ] **T002**: `TickerRepository` インターフェースに `getAllItems()` を追加する
- [ ] **T003**: `InMemoryTickerRepository` にも `getAllItems()` を実装する（テスト用）
- [ ] **T004**: `getAllItems()` のユニットテストを追加する

### Phase 2: API 層の修正

- [ ] **T005**: `GET /api/tickers`（`services/stock-tracker/web/app/api/tickers/route.ts`）で `tickerRepo.getAllItems()` を使うよう変更し、全件取得後にメモリページングを行う
- [ ] **T006**: `GET /api/summaries`（`services/stock-tracker/web/app/api/summaries/route.ts`）で `tickerRepository.getAllItems()` を使い `tickerMap` を完全構築する
- [ ] **T007**: API 層のユニットテストを修正・追加する

### Phase 3: 動作確認とテスト

- [ ] **T008**: ティッカーが50件以上存在するシナリオのユニットテストを追加（`getAll()` が複数ページになるケース）
- [ ] **T009**: ビルドが通ることを確認（`npm run build --workspace=@nagiyu/stock-tracker-core`、`@nagiyu/stock-tracker-web`）
- [ ] **T010**: E2E テストがパスすることを確認

## 影響ファイル

| ファイル | 変更内容 |
|---------|---------|
| `services/stock-tracker/core/src/repositories/ticker.repository.interface.ts` | `getAllItems()` メソッドの追加 |
| `services/stock-tracker/core/src/repositories/dynamodb-ticker.repository.ts` | `getAllItems()` の実装（ループスキャン） |
| `services/stock-tracker/core/src/repositories/in-memory-ticker.repository.ts` | `getAllItems()` の実装 |
| `services/stock-tracker/web/app/api/tickers/route.ts` | `getAllItems()` を使った全件取得に変更 |
| `services/stock-tracker/web/app/api/summaries/route.ts` | `getAllItems()` を使った tickerMap 構築に変更 |
| `services/stock-tracker/core/tests/unit/repositories/dynamodb-ticker.repository.test.ts` | `getAllItems()` のテスト追加 |

## 参考ドキュメント

- `docs/development/rules.md` - コーディング規約
- `docs/development/architecture.md` - アーキテクチャ方針
- `services/stock-tracker/core/src/repositories/ticker.repository.interface.ts` - リポジトリインターフェース
- `services/stock-tracker/core/src/repositories/dynamodb-ticker.repository.ts` - DynamoDB 実装
- `services/stock-tracker/web/app/api/tickers/route.ts` - ティッカー API
- `services/stock-tracker/web/app/api/summaries/route.ts` - サマリー API

## 備考・未決定事項

- `getAll()` メソッドはそのまま残し、`getAllItems()` を新設する方針とするか、`getAll()` 自体の動作を変更するかは実装者の判断に委ねる。ただし、既存テストへの影響を最小化するため **新設が推奨**。
- 将来的にティッカー数が数千件を超える規模になった場合は、Scan ベースの全件取得からより効率的なアクセスパターンへの移行（例: GSI 活用）を検討する。
