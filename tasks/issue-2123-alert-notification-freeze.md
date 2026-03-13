# アラート追加で通知を入力したら画面が固まる

## 概要

StockTracker のサマリー画面からアラートを追加する際、通知設定（通知タイトル・通知本文）を入力すると
画面が固まり、保存・画面遷移・モーダルのクローズができなくなるバグを修正する。

## 関連情報

- Issue: #2123
- タスクタイプ: サービスタスク（stock-tracker）
- 対象ファイル: `services/stock-tracker/web/components/AlertSettingsModal.tsx`

## 調査結果

### 再現手順

1. StockTracker サマリー画面を開く
2. 「アラート追加」を押下し `AlertSettingsModal` を開く
3. 「通知本文」テキストエリアに文字を入力する
4. 画面が固まり、保存ボタン・キャンセルボタン・閉じるボタンが押下できなくなる

### 根本原因

`AlertSettingsModal.tsx` 内でチャートオーバーレイ用ライン情報（`chartAlertLines`）を
`useMemo` なしで毎レンダリング再計算しているため、通知テキストを1文字入力するたびに
以下の連鎖が発生してメインスレッドが占有される。

```
通知テキスト入力
  → formData state 更新
  → AlertSettingsModal 再レンダリング
  → chartAlertLines 再生成（新しい配列参照）
  → StockChart に新しい alertLines prop が渡される
  → StockChart 再レンダリング
  → getChartOption() がローソク足50本分の全データを再計算
  → ReactECharts が notMerge={true} でキャンバスを完全再描画
```

#### 問題箇所

**`AlertSettingsModal.tsx` Line 297（useMemo なし）**

```tsx
const chartAlertLines = computeAlertLines(getChartAlertConditions(formData));
```

- `formData` が変わるたびに（通知テキスト含む）常に新しい配列が生成される
- `chartAlertLines` に変化がなくても StockChart が新しい参照を受け取り再レンダリングする

**`StockChart.tsx` Line 377–390（`notMerge={true}` による完全再描画）**

```tsx
<ReactECharts
  option={getChartOption()}
  notMerge={true}
  lazyUpdate={true}
/>
```

- `notMerge={true}` はオプションを差分更新せずに全置換するため、
  props が変わるたびに ECharts がキャンバスを完全に再描画する
- `getChartOption()` がインラインで呼ばれており、毎レンダリング実行される

### 影響範囲

- 通知タイトル（`notificationTitle`）入力時も同様に発生する可能性がある
- 他のフォームフィールド変更時も同様だが、通知本文は `multiline` TextField で
  頻繁なキー入力が発生するため症状が顕著になる

## 要件

### 機能要件

- FR1: 通知タイトル・通知本文を入力しても画面が固まらないこと
- FR2: アラート価格条件を変更した場合はチャートオーバーレイが即時更新されること
- FR3: 既存のアラート設定・保存機能が正常に動作し続けること

### 非機能要件

- NFR1: 通知テキスト入力時に ECharts キャンバスの不要な再描画が発生しないこと
- NFR2: テストカバレッジ 80% 以上を維持すること

## 実装方針

### 修正1: `AlertSettingsModal.tsx` — `chartAlertLines` を `useMemo` で最適化（必須）

`chartAlertLines` の依存を価格条件に関係するフィールドのみに限定することで、
通知テキスト変更時に StockChart への prop 参照変化を防ぐ。

**変更対象**: `services/stock-tracker/web/components/AlertSettingsModal.tsx`

- `useState`, `useEffect` の import に `useMemo` を追加する
- Line 297 の `chartAlertLines` 計算を `useMemo` でラップし、依存配列に
  価格条件フィールド（`conditionMode`, `operator`, `targetPrice`, `rangeType`,
  `minPrice`, `maxPrice`）のみを指定する

### 修正2: `StockChart.tsx` — `getChartOption` を `useMemo` で最適化（推奨）

`AlertSettingsModal` 側を修正すれば症状は解消するが、`StockChart` 自体も
`chartData` や `alertLines` が変わらない限り `getChartOption()` を再実行しない
よう `useMemo` で最適化することで、今後の利用箇所でも安全になる。

**変更対象**: `services/stock-tracker/web/components/StockChart.tsx`

- `useEffect`, `useRef` の import に `useMemo` を追加する
- `getChartOption()` 関数呼び出しを `useMemo` でラップし、依存配列に
  `chartData`, `holdingPrice`, `alertLines` を指定する

## タスク

- [ ] T001: `AlertSettingsModal.tsx` の `useMemo` import 追加
- [ ] T002: `chartAlertLines` 計算を `useMemo` でラップ（依存配列: 価格条件フィールド）
- [ ] T003: `StockChart.tsx` の `useMemo` import 追加
- [ ] T004: `getChartOption()` を `useMemo` でラップ（依存配列: `chartData`, `holdingPrice`, `alertLines`）
- [ ] T005: 既存ユニットテストが通ることを確認（`npm run test --workspace=@nagiyu/stock-tracker-web`）
- [ ] T006: E2E テストで通知テキスト入力時に画面が固まらないことを確認

## 参考ドキュメント

- `docs/development/rules.md` — コーディング規約
- `services/stock-tracker/web/tests/unit/components/alert-settings-modal-mode.test.ts`
- `services/stock-tracker/web/tests/unit/components/alert-validation.test.ts`
- `services/stock-tracker/web/tests/unit/components/stock-chart-auto-refresh.test.ts`

## 備考・未決定事項

- `notMerge={true}` の見直し（`false` にすると差分更新になるが副作用要確認）については
  今回の修正スコープ外とし、`useMemo` 対応のみで対処する
- E2E テストで再現確認できない場合は、ローカルブラウザでの手動確認を優先する
