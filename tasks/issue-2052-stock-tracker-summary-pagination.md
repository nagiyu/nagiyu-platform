# StockTracker サマリー一部しか表示されない問題の修正

## 概要

StockTracker のサマリー画面において、取引所単位で取得するサマリーが一部しか表示されない。
DynamoDB のクエリは 1 回のレスポンスで最大 1MB のデータしか返さないが、
`getByExchange()` の実装がページネーションに対応しておらず、2 ページ目以降のデータが取得できていない。

## 関連情報

- Issue: #2052
- タスクタイプ: サービスタスク（stock-tracker/core）

## 原因調査

### 問題の所在

`services/stock-tracker/core/src/repositories/dynamodb-daily-summary.repository.ts`  
の `getByExchange()` メソッドが DynamoDB の `LastEvaluatedKey` を無視しており、
1 回の `QueryCommand` で返せる範囲（最大 1MB）のデータしか取得していない。

### 症状

- DynamoDB の `ExchangeSummaryIndex`（GSI4）に対するクエリで、ある取引所の
  日次サマリー全件が 1MB を超えると後続ページが取得されない。
- 結果として、サマリー画面に表示される銘柄が一部のみとなる。

### 関連コード

| ファイル | 内容 |
|---|---|
| `services/stock-tracker/core/src/repositories/dynamodb-daily-summary.repository.ts` | 修正対象: `getByExchange()` |
| `services/stock-tracker/core/src/repositories/daily-summary.repository.interface.ts` | インターフェース定義（変更不要） |
| `services/stock-tracker/web/app/api/summaries/route.ts` | 呼び出し側（変更不要） |

### 他リポジトリとの比較

同ファイル内の `DynamoDBHoldingRepository.getByUserId()` や
`DynamoDBTickerRepository.getAll()`（Scan）は `LastEvaluatedKey` を使って
ページ送りループを実装しているため、同様のパターンで修正できる。

## 要件

### 機能要件

- FR1: `getByExchange()` は `LastEvaluatedKey` が返る限りクエリを繰り返し、全件を取得して返す
- FR2: 既存のインターフェース `DailySummaryRepository.getByExchange()` のシグネチャは変更しない
- FR3: `date` 指定あり・なしの両ケースでページネーションが正しく動作する
- FR4: `date` なし（最新日付取得）ロジックはページネーション適用後の全件から算出する

### 非機能要件

- NFR1: 既存のユニットテストが引き続き通ること
- NFR2: テストカバレッジ 80% 以上を維持すること
- NFR3: TypeScript strict mode 適合

## 実装方針

`getByExchange()` 内で `ExclusiveStartKey` を用いたループを追加する。

- `while` ループで `QueryCommand` を発行し続け、`result.LastEvaluatedKey` が
  `undefined` になるまで繰り返す。
- 各ページの `result.Items` を累積し、全件まとめてから後続フィルタ処理を行う。

既存の `date` 指定なし時の「最新日付フィルタ」処理はループ完了後の全アイテムに適用する。

## タスク

- [ ] T001: `dynamodb-daily-summary.repository.ts` の `getByExchange()` にページネーションループを追加
- [ ] T002: ユニットテストに「2 ページ以上のデータを返すケース」を追加
    - 対象: `services/stock-tracker/core/tests/unit/repositories/dynamodb-daily-summary.repository.test.ts`（または同等のテストファイル）
- [ ] T003: ローカルビルド・テストで既存テストが通ることを確認
- [ ] T004: カバレッジ 80% 以上を確認

## 参考ドキュメント

- `docs/development/rules.md` — コーディング規約
- `services/stock-tracker/core/src/repositories/dynamodb-holding.repository.ts` — ページネーション実装例（`getByUserId`）

## 備考・未決定事項

- 大量データ（数千件）を一度に返すことによるレスポンス遅延が懸念される場合は、
  将来的に UI 側でのページネーション対応も検討する（今回のスコープ外）。
- GSI4 の `ExchangeSummaryIndex` に対するクエリで `date` 指定なしの場合、
  全期間のデータを取得してから最新日付でフィルタするため、テーブルが大きくなると
  取得コストが増大する。将来的には `date` を必須引数にするか、
  デフォルト期間（例: 直近 N 日）を設けることでコスト削減が見込める（今回のスコープ外）。
