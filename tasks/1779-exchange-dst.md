# 取引所のサマータイム考慮

## 概要

取引所の営業時間設定において、サマータイム（DST: Daylight Saving Time）を考慮した設定ができるようにする。

現在の `ExchangeEntity` は `Start`/`End` フィールドに単一の時刻（HH:MM形式）しか持たない。
タイムゾーン変換には `date-fns-tz` を使用しており、IANA形式のタイムゾーン指定であれば DST が自動的に反映される。
しかし、一部の取引所ではサマータイム期間と標準時期間で**営業時間自体が異なる**ケースがある。
このような取引所に対応するため、DST期間用の営業時間フィールドを追加する。

## 関連情報

- Issue: #1779
- 親Issue: #1778 (Stock Tracker の改善)
- マイルストーン: v5.5.0
- タスクタイプ: サービスタスク（stock-tracker）

## 現状分析

### 現在の仕組み

- `ExchangeEntity.Timezone` に IANA形式のタイムゾーン（例: `America/New_York`）を設定
- `ExchangeEntity.Start` / `ExchangeEntity.End` に営業開始・終了時刻（HH:MM形式）を設定
- `trading-hours-checker.ts` の `isTradingHours()` で `date-fns-tz` の `toZonedTime()` を使い、
    現在時刻を取引所のタイムゾーンに変換してから `Start`/`End` と比較する

### 現在の問題

`date-fns-tz` の `toZonedTime()` はIANAタイムゾーンのDST遷移を自動的に処理するため、
`Start`/`End` がローカル時刻として解釈される場合は DST は自動対応済みである。

ただし、以下のユースケースに対応できていない:

- 取引所がサマータイム期間と標準時期間で**意図的に異なる営業時間**を設定している場合
    - 例: 標準時 09:00〜17:30、サマータイム 08:00〜16:30
- 管理者がサマータイム対応を明示的に設定・確認できるUIがない

## 要件

### 機能要件

- FR1: `ExchangeEntity` に DST期間用の営業時間フィールド（`DstStart` / `DstEnd`）を追加できる
- FR2: `DstStart` / `DstEnd` はオプションフィールドとする（設定しない場合は通年 `Start`/`End` を使用）
- FR3: `isTradingHours()` で、現在時刻がDSTに該当する場合は `DstStart`/`DstEnd` を優先して判定する
- FR4: `getLastTradingDate()` でも同様にDST期間を考慮した営業時間を使用する
- FR5: 取引所管理UI（`exchanges/page.tsx`）でDST営業時間を設定・表示できる
- FR6: DSTの適用可否は、設定されたIANAタイムゾーンに基づいて自動判定する

### 非機能要件

- NFR1: `DstStart` / `DstEnd` 未設定時の後方互換性を維持する
- NFR2: バリデーション（`validation/index.ts`）に `DstStart`/`DstEnd` のHH:MM形式チェックを追加する
- NFR3: テストカバレッジ80%以上を維持する
- NFR4: TypeScript strict mode を遵守する
- NFR5: エラーメッセージは日本語で `ERROR_MESSAGES` / `TRADING_HOURS_ERROR_MESSAGES` に定数化する

## 実装のヒント

### DST判定ロジック

- `date-fns-tz` の `toZonedTime()` を活用することで、指定日時が DST中かどうかを判定できる
    - 同一UTCタイムスタンプに対して、IANAタイムゾーンを指定してオフセットを取得し、
        標準オフセットと比較することでDST中かを判断できる
- 別途 `date-fns-tz` の `getTimezoneOffset()` を利用する方法も検討する

### エンティティ変更

- `ExchangeEntity` に `DstStart?: string` / `DstEnd?: string` を追加（オプションフィールド）
- `UpdateExchangeInput` にも `DstStart`/`DstEnd` を含める
- DynamoDB マッパー（`exchange.mapper.ts`）に `DstStart`/`DstEnd` の読み書き処理を追加

### UIの変更

- `exchanges/page.tsx` の作成・編集フォームに「サマータイム営業時間」セクションを追加
    - DST開始時間（時・分）セレクト
    - DST終了時間（時・分）セレクト
    - 「設定しない（通年同じ営業時間）」オプション
- 一覧テーブルにDST対応の営業時間を表示（例: 標準: 09:00-17:30 / 夏時間: 08:00-16:30）

### APIの変更

- `app/api/exchanges/route.ts`（POST）と `app/api/exchanges/[id]/route.ts`（PUT）の
    リクエストボディに `dstStart`/`dstEnd` を追加
- レスポンスの `tradingHours` オブジェクトに `dstStart`/`dstEnd` を含める

## タスク

### Phase 1: コアロジックの更新

- [ ] T001: `ExchangeEntity` に `DstStart?: string` / `DstEnd?: string` を追加
- [ ] T002: `types.ts` の `Exchange` 型に同フィールドを追加
- [ ] T003: `trading-hours-checker.ts` の `isTradingHours()` にDST期間判定ロジックを追加
- [ ] T004: `trading-hours-checker.ts` の `getLastTradingDate()` にDST期間判定ロジックを追加
- [ ] T005: `validation/index.ts` に `DstStart`/`DstEnd` のバリデーションを追加
- [ ] T006: `exchange.mapper.ts` に `DstStart`/`DstEnd` のマッピング処理を追加
- [ ] T007: `trading-hours-checker.test.ts` にDST対応テストケースを追加

### Phase 2: APIの更新

- [ ] T008: `app/api/exchanges/route.ts`（POST）のリクエスト/レスポンスに `dstStart`/`dstEnd` を追加
- [ ] T009: `app/api/exchanges/[id]/route.ts`（PUT/GET）に `dstStart`/`dstEnd` を追加

### Phase 3: UIの更新

- [ ] T010: `exchanges/page.tsx` の `ExchangeFormData` に `dstStart`/`dstEnd` フィールドを追加
- [ ] T011: フォームにサマータイム営業時間の入力セクションを追加（未設定オプション含む）
- [ ] T012: 一覧テーブルのDST時間表示を追加
- [ ] T013: E2Eテストの更新（必要に応じて）

## 参考ドキュメント

- `services/stock-tracker/core/src/entities/exchange.entity.ts` - エンティティ定義
- `services/stock-tracker/core/src/services/trading-hours-checker.ts` - 営業時間チェックロジック
- `services/stock-tracker/core/src/validation/index.ts` - バリデーションルール
- `services/stock-tracker/core/src/mappers/exchange.mapper.ts` - DynamoDBマッパー
- `services/stock-tracker/web/app/exchanges/page.tsx` - 取引所管理UI
- `services/stock-tracker/web/app/api/exchanges/route.ts` - 取引所API（POST/GET）
- `services/stock-tracker/web/app/api/exchanges/[id]/route.ts` - 取引所API（GET/PUT/DELETE）
- `docs/development/rules.md` - コーディング規約

## 備考・未決定事項

- **DST判定の実装方法**: `date-fns-tz` の `getTimezoneOffset()` を使う方式か、標準ライブラリの
    `Intl.DateTimeFormat` を使う方式か、要検討
- **DSTを観測しないタイムゾーン**: `Asia/Tokyo` や `Asia/Shanghai` などは DST を採用していないため、
    `DstStart`/`DstEnd` が設定されていてもDST判定は常に `false` となる挙動を明確にする
- **UIのDST表示**: DST非対応タイムゾーンを選択中は、DST時間設定セクションをグレーアウト
    （非活性化）するか非表示にするかを検討する
- **既存データの移行**: `DstStart`/`DstEnd` はオプションフィールドのため、DynamoDB上の
    既存レコードはそのまま継続利用できる（後方互換性あり）
