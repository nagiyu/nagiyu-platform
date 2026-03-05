# サマリーバッチの更新条件変更

## 概要

日次サマリー生成バッチ（`services/stock-tracker/batch/src/summary.ts`）の更新判定ロジックを変更する。

現在は「取引時間外かどうか」でスキップ判定しているが、より細粒度な条件で処理の要否を判断するよう改善する。具体的には、静的解析（OHLC・パターン分析）と AI 解析の判定を分離し、パターンは登録されているパターン単位で欠損検出するようにする。

## 関連情報

- Issue: #（未採番）
- タスクタイプ: サービスタスク（stock-tracker/batch）

## 現状の課題

### 課題 1: 取引時間中の無駄なスキップ

```
isTradingHours(exchange, now) === true → 取引所全体をスキップ
```

`getLastTradingDate()` は取引終了前であれば前日の日付を返すため、`isTradingHours` チェックは論理的に冗長となっている。また、取引時間中でも「前回取引日のサマリー」は更新可能なため、スキップすべきでないケースが存在する。

### 課題 2: パターン分析の判定が粗い

```typescript
const hasPatternAnalysis =
    existingSummary?.PatternResults !== undefined &&
    existingSummary.BuyPatternCount !== undefined &&
    existingSummary.SellPatternCount !== undefined;
```

`PatternResults` が存在するかどうかだけを見ており、`PATTERN_REGISTRY` に新しいパターンが追加された場合でも既存レコードをスキップしてしまう。

### 課題 3: 静的解析と AI 解析の判定が混在

OHLC + パターン分析（静的・安定）と AI 解析（外部 API・不安定）の判定が同一フローに混在しており、片方の再実行が他方に影響する。

## 要件

### 機能要件

- **FR1**: 取引所ごとのループ処理において、`isTradingHours` によるスキップを撤廃する
- **FR2**: ループ先頭で `getLastTradingDate(exchange, now)` を用いて「登録されるべきサマリー日付」を算出する
- **FR3**: ティッカーごとに、算出した日付のサマリーを取得する
- **FR4**: 静的解析（OHLC・パターン分析）の要否を以下の条件で判定する
    - 対象日付のサマリーが存在しない → 要
    - OHLC（Open/High/Low/Close）のいずれかが未設定 → 要
    - `PATTERN_REGISTRY` に登録されている各パターンの結果が `PatternResults` に含まれていない → 要
- **FR5**: AI 解析の要否を以下の条件で判定する（静的解析とは独立して判定する）
    - `AiAnalysis` が未設定 → 要
- **FR6**: 静的解析が不要と判断されても、AI 解析が必要な場合は AI 解析のみ実行する
- **FR7**: 静的解析が必要な場合は、チャートデータ取得 → パターン分析 → 保存 を実行する
- **FR8**: AI 解析が必要な場合は、AI 解析 → 保存 を実行する

### 非機能要件

- **NFR1**: AI 解析の失敗（例外）は既存と同様に graceful degradation（`AiAnalysisError` 保存して継続）
- **NFR2**: 静的解析の失敗は既存と同様に警告ログ出力・統計記録・処理継続
- **NFR3**: テストカバレッジ 80% 以上を維持する
- **NFR4**: TypeScript strict mode を維持する

## 実装方針

### 判定ロジックの整理

処理フローを以下の 2 段階に分離して判定する。

#### 段階 1: 静的解析が必要か？

`PATTERN_REGISTRY` の全パターン ID が `PatternResults` に存在するかチェックする。
新しいパターンが追加された場合もパターン単位で未反映を検出できるようにする。

概念的表現:

```
needsStaticAnalysis =
  existingSummary が null
  OR OHLC のいずれかが未設定
  OR PATTERN_REGISTRY に含まれるパターン ID が PatternResults に存在しない
```

#### 段階 2: AI 解析が必要か？

静的解析の結果に依存せず、独立した判定を行う。

概念的表現:

```
needsAiAnalysis =
  AiAnalysis が undefined
```

### 処理フロー

```
取引所ごとにループ:
  summaryDate = getLastTradingDate(exchange, now)   ← isTradingHours チェックを削除
  ティッカーごとにループ:
    existingSummary = getByTickerAndDate(tickerId, summaryDate)
    
    if needsStaticAnalysis(existingSummary):
      chartData を取得
      patternAnalysis を実行
      summary を upsert（AiAnalysis は existingSummary の値を引き継ぐ）
      summariesSaved++
    
    if needsAiAnalysis(existingSummary or 直前に保存した entity):
      AI 解析を実行
      summary を upsert（AiAnalysis を更新）
      aiAnalysisGenerated++ or aiAnalysisSkipped++（失敗時）
```

### 統計情報の変更

`BatchStatistics` 型の `skippedTradingExchanges` は削除を検討する（または `skippedExchanges` へ変更）。
静的解析スキップとAI解析スキップの統計も明確に分けると可観測性が向上する。

## タスク

- [ ] T001: `processExchange` から `isTradingHours` チェックを削除する
- [ ] T002: `BatchStatistics` の `skippedTradingExchanges` フィールドを削除または改名する
    - 影響ファイル: `summary.ts`
- [ ] T003: パターン判定ロジックを「パターン単位で欠損検出」に変更する
    - `hasPatternAnalysis` の判定を `PATTERN_REGISTRY` の全パターンが `PatternResults` に存在するかのチェックに変更
    - 影響ファイル: `summary.ts`
- [ ] T004: 静的解析と AI 解析の判定分岐を分離する
    - `needsStaticAnalysis`（関数または変数）と `needsAiAnalysis`（変数）を独立させる
    - 静的解析不要でも AI 解析は実行できるようにする
    - 影響ファイル: `summary.ts`
- [ ] T005: `HandlerDependencies` から `isTradingHoursFn` を削除する
    - 影響ファイル: `summary.ts`
- [ ] T006: テストを更新・追加する
    - 既存の「取引時間中スキップ」シナリオを削除または変更する
    - 「PATTERN_REGISTRY に新パターンが追加された場合に再解析が走る」シナリオを追加する
    - 「静的解析済み・AI 解析未実施の場合に AI 解析のみ実行される」シナリオを確認・追加する
    - 影響ファイル: `tests/unit/summary.test.ts`

## 参考ドキュメント

- コーディング規約: `docs/development/rules.md`
- テスト戦略: `docs/development/testing.md`

## 影響範囲

| ファイル | 変更種別 |
|--------|---------|
| `services/stock-tracker/batch/src/summary.ts` | 変更 |
| `services/stock-tracker/batch/tests/unit/summary.test.ts` | 変更 |

## 備考・未決定事項

- `getLastTradingDate` の戻り値が取引終了前は前日の日付を指すため、「取引時間中はスキップ」という概念は不要になる。ただし将来的に当日データのリアルタイム処理を追加する場合は再考が必要。
- `AiAnalysisError` が存在する場合（過去の失敗）は、次回バッチで再試行されるのが現挙動。この仕様は変更しない。
- `skippedTradingExchanges` の統計フィールドを削除する場合、既存のアラートやダッシュボードが参照していないか確認すること。
