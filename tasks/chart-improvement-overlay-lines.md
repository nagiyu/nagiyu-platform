# チャートへの追加描画（保有株価・アラートライン）

## 概要

stock-tracker サービスの `StockChart` コンポーネントに対し、ローソク足チャート上に
以下の横線（水平ライン）を追加描画する機能を実装する。

1. **保有株価ライン**: 保有株式がある場合、平均取得価格を横線で表示する
2. **アラートライン**: アラート設定時に、上限・下限の価格ラインを横線で表示する

それぞれ色を変えて視覚的にわかりやすくする。

## 関連情報

- Issue: チャートの改善
- タスクタイプ: サービスタスク（stock-tracker-web）
- 対象サービス: `services/stock-tracker/web`

## 現状分析

### StockChart コンポーネント

| 項目 | 内容 |
|------|------|
| ファイル | `services/stock-tracker/web/components/StockChart.tsx` |
| ライブラリ | Apache ECharts（`echarts-for-react`） |
| チャート種別 | ローソク足 + 出来高バー |
| Props | `tickerId: string`, `timeframe: string`, `count?: number` |
| markLine | 未実装（追加対象） |

### アラート条件の型（`types/alert.ts`）

```
AlertCondition {
  field: 'price'
  operator: 'gte' | 'lte'   // gte = 上限, lte = 下限
  value: number
}

AlertResponse {
  conditions: AlertCondition[]
  logicalOperator?: 'AND' | 'OR'
  ...
}
```

単一条件の場合は上限（gte）または下限（lte）いずれか 1 本のライン。
範囲条件の場合（conditions.length === 2）は上限・下限の 2 本のライン。

### 保有株価の取得経路

- **ホームページ（HomePageClient.tsx）**: チャート API（`/api/chart/{tickerId}`）の
  レスポンスに保有情報（`holdingAveragePrice`）を含める形で取得する
- **サマリー画面（summaries/page.tsx）**: `TickerSummary.holding.averagePrice` として
  すでに API レスポンスに含まれている
- **アラート設定ダイアログ（AlertSettingsModal.tsx）**: 現状 `basePrice` prop が存在するが
  保有価格は未渡し。親コンポーネントから `holdingPrice` を渡す形で対応する

## 要件

### 機能要件

- FR1: `StockChart` コンポーネントに `holdingPrice?: number` プロパティを追加する
    - 値が渡された場合、その価格位置に黄色系の横線（markLine）を描画する
    - ラベルに「保有価格」と表示する
- FR2: `StockChart` コンポーネントに `alertLines?: AlertLine[]` プロパティを追加する
    - `AlertLine` 型: `{ price: number; label: string; type: 'upper' | 'lower' }` 相当
    - 上限ライン（`type: 'upper'`）は赤系の横線で描画し、ラベルに「上限」を表示する
    - 下限ライン（`type: 'lower'`）は青系の横線で描画し、ラベルに「下限」を表示する
    - 線は破線（dashed）とし、ローソク足の視認性を損なわないようにする
- FR3: `AlertLine` 型とそのヘルパー関数（`computeAlertLines`）を
  `AlertSettingsModal.tsx` から export する
    - `computeAlertLines(conditions: AlertCondition[]): AlertLine[]` は conditions から
      AlertLine 配列を生成するヘルパー
- FR4: `AlertSettingsModal` 内のチャートに `alertLines` を渡す
    - アラート設定値（上限・下限価格）が変化するたびにチャートのラインを更新する
    - 編集モードでは既存の conditions を初期値として描画する
- FR5: ホームページ（`HomePageClient.tsx`）のチャートに `holdingPrice` を渡す
    - 対象ティッカーの保有情報がある場合のみラインを表示する
    - 保有情報がない場合は `holdingPrice` を渡さない（ラインを表示しない）
- FR6: サマリー画面（`summaries/page.tsx`）のチャート（実装済みの場合）にも
  `holdingPrice` を渡す
    - `TickerSummary.holding.averagePrice` を使用する

### 非機能要件

- NFR1: TypeScript strict mode 準拠、`AlertLine` 型は適切な型定義ファイルに配置する
- NFR2: テストカバレッジ 80% 以上（変更コンポーネントのユニットテストを追加・更新）
- NFR3: 既存のユニットテスト・E2E テストがすべて通過すること
- NFR4: モバイル（スマホファースト）での視認性を確保すること
    - ラインのラベルが小さな画面でも読めること（フォントサイズ・位置調整）
- NFR5: ECharts の markLine は `series` の一部として実装し、
  既存の candlestick series への `markLine` オプション追加で対応する

## 実装のヒント

### ECharts markLine の組み込み方

ECharts の `series[0]`（candlestick）に `markLine` オプションを追加することで
水平線を描画できる。

```
markLine: {
  symbol: 'none',
  lineStyle: { type: 'dashed', width: 1 },
  data: [
    { yAxis: <price>, name: '保有価格', lineStyle: { color: '#FFC107' } },
    { yAxis: <upper>, name: '上限',    lineStyle: { color: '#EF5350' } },
    { yAxis: <lower>, name: '下限',    lineStyle: { color: '#42A5F5' } },
  ]
}
```

- `holdingPrice` が `undefined` の場合はそのエントリーを含めない
- `alertLines` が空配列またはは `undefined` の場合も同様

### AlertLine 型の定義・配置

`types/alert.ts` または `types/chart.ts`（新規作成可）に `AlertLine` 型を定義する。
`AlertSettingsModal.tsx` に `computeAlertLines` ヘルパーを定義し、
同ファイルから export することで `AlertSettingsModal` および呼び出し元が使用できる。

```
export interface AlertLine {
  price: number;
  label: string;
  type: 'upper' | 'lower';
}

export function computeAlertLines(conditions: AlertCondition[]): AlertLine[]
```

### ホームページでの保有価格取得

チャート API（`/api/chart/{tickerId}`）のレスポンスに保有情報（`holdingAveragePrice?: number`）を
追加し、`HomePageClient.tsx` でチャートデータ取得と同時に保有価格を取得する方式を採用する。
この API 変更は本 Issue のスコープに含める。

- チャート API レスポンスに `holdingAveragePrice?: number` フィールドを追加する
- バックエンド（`/app/api/chart/[tickerId]/route.ts`）で保有情報リポジトリから
  該当ティッカーの保有平均価格を取得してレスポンスに含める
- 保有情報がない場合は `holdingAveragePrice` を含めない（`undefined` または省略）
- `HomePageClient.tsx` はチャートデータ取得後に `holdingAveragePrice` を
  `StockChart` の `holdingPrice` prop に渡す

## タスク

### Phase 1: 型定義とヘルパーの追加

- [ ] T001: `types/alert.ts`（または `types/chart.ts`）に `AlertLine` 型を定義する
- [ ] T002: `AlertSettingsModal.tsx` に `computeAlertLines(conditions: AlertCondition[]): AlertLine[]`
  ヘルパー関数を実装し export する
    - `operator: 'gte'` → `type: 'upper'`、`operator: 'lte'` → `type: 'lower'` にマッピング

### Phase 2: StockChart コンポーネントの修正

- [ ] T003: `StockChart.tsx` の Props 型（`StockChartProps`）に `holdingPrice?: number` と
  `alertLines?: AlertLine[]` を追加する
- [ ] T004: `getChartOption()` の `series[0]`（candlestick）に `markLine` オプションを追加する
    - `holdingPrice` → 黄色系（`#FFC107`）の破線
    - `alertLines` の `upper` → 赤系（`#EF5350`）の破線
    - `alertLines` の `lower` → 青系（`#42A5F5`）の破線
    - いずれも `undefined` または空配列の場合はラインを描画しない

### Phase 3: AlertSettingsModal への組み込み

- [ ] T005: `AlertSettingsModal.tsx` 内の `StockChart` 呼び出しに `alertLines` を渡す
    - 現在のフォーム入力値（上限・下限価格）を `computeAlertLines` に通して渡す
    - フォーム値が変化するたびに `alertLines` が更新され、チャートに反映されること

### Phase 4: ホームページへの組み込み

- [ ] T006: チャート API（`/api/chart/{tickerId}`）のレスポンスに `holdingAveragePrice?: number` を追加する
    - `app/api/chart/[tickerId]/route.ts` で保有情報リポジトリから平均取得価格を取得する
    - 保有情報がない場合はフィールドを省略する
- [ ] T007: `HomePageClient.tsx` の `StockChart` 呼び出しに `holdingPrice` を渡す
    - チャートデータ取得後に `holdingAveragePrice` を `holdingPrice` prop に渡す
    - 保有情報がない場合は `holdingPrice` を渡さない

### Phase 5: サマリー画面への組み込み（チャートが表示されている場合）

- [ ] T008: `summaries/page.tsx` のチャートに `holdingPrice` を渡す
    - `TickerSummary.holding?.averagePrice` を使用する

### Phase 6: テスト

- [ ] T009: `StockChart` コンポーネントのユニットテストに markLine 描画テストを追加する
    - `holdingPrice` 指定時にラインが含まれること
    - `alertLines` 指定時にラインが含まれること
    - 未指定時にラインが含まれないこと
- [ ] T010: `computeAlertLines` のユニットテストを追加する
    - `gte` 条件 → `upper` への変換
    - `lte` 条件 → `lower` への変換
    - 複数条件の変換

### Phase 7: 品質チェック

- [ ] T011: TypeScript コンパイルエラーがないことを確認する（`npm run build`）
- [ ] T012: ESLint エラーがないことを確認する（`npm run lint`）
- [ ] T013: Prettier フォーマットが統一されていることを確認する（`npm run format:check`）
- [ ] T014: テストカバレッジが 80% 以上であることを確認する

## 参考ドキュメント

- `docs/development/rules.md` - コーディング規約
- `docs/development/architecture.md` - アーキテクチャ方針
- `docs/services/stock-tracker/architecture.md` - stock-tracker アーキテクチャ
- `docs/development/testing.md` - テスト戦略

## 備考・未決定事項

- `/api/chart/{tickerId}` レスポンスへの `holdingAveragePrice` 追加に伴い、
  チャートデータ型（`ChartData` interface）を更新する必要がある
- `/api/holdings` エンドポイントが tickerId フィルタリングをサポートしていない場合は、
  チャート API 側で全保有データを取得してクライアント側でフィルタリングする
