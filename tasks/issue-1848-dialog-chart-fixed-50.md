# ダイアログのチャート表示本数を50本固定にする

## 概要

Stock Tracker のダイアログ（AlertSettingsModal）内に表示されるチャートの表示本数を、ユーザー選択式ではなく 50 本固定とする。

## 関連情報

- Issue: #1848
- タスクタイプ: サービスタスク（stock-tracker/web）
- マイルストーン: v5.6.0

## 要件

### 機能要件

- FR1: `AlertSettingsModal` 内の StockChart に渡す `count` を 50 本固定にする
- FR2: ダイアログ内のチャート表示本数を変更できるドロップダウン UI を削除する
- FR3: チャート表示本数に関連する state 変数（`chartBarCount`）および操作関数（`handleChartBarCountChange`）を `AlertSettingsModal` から削除する

### 非機能要件

- NFR1: ホームページ (`HomePageClient.tsx`) のチャート表示本数ドロップダウンは変更しない（ダイアログ以外は影響範囲外）
- NFR2: `SummariesPage` ダイアログは既に `count={50}` で固定済みのため変更不要
- NFR3: `types/stock.ts` の `ChartBarCount` 型や `CHART_BAR_COUNTS` 定数はホームページで引き続き使用するため削除しない

## 実装方針

### 変更対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `services/stock-tracker/web/components/AlertSettingsModal.tsx` | `chartBarCount` state・`handleChartBarCountChange` 関数・バー数選択 Select UI を削除し、`count={50}` を直接渡す |

### 変更内容の概要

1. `AlertSettingsModal` 内の `chartBarCount` state 初期化（`DEFAULT_CHART_BAR_COUNT` 参照）を削除
2. `handleChartBarCountChange` 関数を削除
3. チャート表示本数を選択する Select コンポーネントとそのラベルを削除
4. `<StockChart ... count={chartBarCount} />` を `<StockChart ... count={50} />` に変更

## タスク

- [x] T001: `AlertSettingsModal.tsx` の `chartBarCount` state を削除する
- [x] T002: `AlertSettingsModal.tsx` の `handleChartBarCountChange` 関数を削除する
- [x] T003: `AlertSettingsModal.tsx` のバー数選択 Select UI（ラベル含む）を削除する
- [x] T004: `<StockChart>` の `count` prop に `50` を直接渡すよう変更する
- [x] T005: 不要になった `DEFAULT_CHART_BAR_COUNT`・`CHART_BAR_COUNTS`・`CHART_BAR_COUNT_LABELS` のインポートを削除する
- [x] T006: ユニットテスト（`AlertSettingsModal` 関連）を修正・確認する
- [x] T007: lint・build・test を通過させる

## 参考ドキュメント

- `services/stock-tracker/web/components/AlertSettingsModal.tsx` - 変更対象
- `services/stock-tracker/web/types/stock.ts` - `ChartBarCount` 型定義
- `services/stock-tracker/web/components/StockChart.tsx` - chart コンポーネント
- `services/stock-tracker/web/app/summaries/page.tsx` - 固定 50 本の実装参考例

## 備考・未決定事項

- `AlertSettingsModal` のバー数ドロップダウンはホームページの実装と異なる役割（プレビュー用）であり、固定化によりユーザビリティへの影響は軽微と判断
- `SummariesPage` ダイアログは既に固定済みのため、今回の変更と整合性が取れる
