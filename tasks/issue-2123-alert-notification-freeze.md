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

アーキテクチャ上の問題として、フォームの全フィールドを単一の `formData` state オブジェクトで管理し、
共通ハンドラ `handleFormChange` で一括更新しているが、`chartAlertLines` 等の派生値の再計算が
最適化されていないため、通知テキストを1文字入力するたびに
以下の連鎖が発生してメインスレッドが占有される。

```
通知テキスト入力
  → formData state 更新（通知フィールドのみ変更でも全 formData が新参照）
  → AlertSettingsModal 再レンダリング
  → chartAlertLines 再生成（新しい配列参照）
  → StockChart に新しい alertLines prop が渡される
  → StockChart 再レンダリング
  → getChartOption() がローソク足50本分の全データを再計算
  → ReactECharts が notMerge={true} でキャンバスを完全再描画
```

#### 問題箇所

**`AlertSettingsModal.tsx` — 単一 `formData` state と共通ハンドラ（根本原因）**

```tsx
// フォームデータ全体を 1 つの state で管理
const [formData, setFormData] = useState<FormData>(() => buildFormData(...));

// 全フィールド共通の変更ハンドラ
const handleFormChange = (field: keyof FormData, value: string | boolean) => {
  setFormData((prev) => ({ ...prev, [field]: value }));
  // ...
};
```

- 通知テキストを変更しても `formData` オブジェクト全体が新しい参照になる
- チャートに無関係なフィールドの変更が必ず `chartAlertLines` の再計算を引き起こす

**`AlertSettingsModal.tsx` Line 297（useMemo なし）**

```tsx
const chartAlertLines = computeAlertLines(getChartAlertConditions(formData));
```

- `formData` が変わるたびに常に新しい配列が生成される
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

- 通知タイトル（`notificationTitle`）入力時も同様に発生する
- パーセンテージ計算等、価格条件フィールドの変更でも同様の再描画が発生しているが、
  通知本文は `multiline` TextField で頻繁なキー入力が発生するため症状が顕著になる

## 要件

### 機能要件

- FR1: 通知タイトル・通知本文を入力しても画面が固まらないこと
- FR2: アラート価格条件を変更した場合はチャートオーバーレイが即時更新されること
- FR3: 既存のアラート設定・保存機能が正常に動作し続けること

### 非機能要件

- NFR1: 通知テキスト入力時に ECharts キャンバスの不要な再描画が発生しないこと
- NFR2: テストカバレッジ 80% 以上を維持すること

## 実装方針

フォーム全体を単一 state で管理していることが根本原因のため、
全フィールドをそれぞれ独立した `useState` に分割する。

### 全フィールド個別 state への分割

各フィールドをそれぞれ個別の `useState` で管理し、保存・送信アクション時に各 state を集約する
React の慣用的なパターンに沿った実装。

**React 18+ のバッチ処理について**:

React 18 以降、イベントハンドラ内での複数 `setState` 呼び出しは自動的にバッチ処理されるため、
フィールドを完全に個別分割してもパフォーマンス上の問題は生じない。

**概念的なイメージ**:

```tsx
// 価格条件フィールド（変更時に chartAlertLines を再計算）
const [conditionMode, setConditionMode] = useState(...);
const [operator, setOperator] = useState(...);
const [targetPrice, setTargetPrice] = useState(...);
// ...

// 通知・設定フィールド（変更してもチャートに影響しない）
const [notificationTitle, setNotificationTitle] = useState(...);
const [notificationBody, setNotificationBody] = useState(...);
const [frequency, setFrequency] = useState(...);
const [enabled, setEnabled] = useState(...);
const [temporary, setTemporary] = useState(...);

// chartAlertLines は useMemo で価格条件フィールドのみに依存
const chartAlertLines = useMemo(
  () => computeAlertLines(getChartAlertConditions({ conditionMode, operator, targetPrice, ... })),
  [conditionMode, operator, targetPrice, ...]
);
```

**変更対象**: `services/stock-tracker/web/components/AlertSettingsModal.tsx`

- `formData` state を全フィールド個別の `useState` に分割する
- `handleFormChange` の共通ハンドラを廃止し、各フィールドの setter を直接使う
- `handleSubmit` 時に各 state を集約してリクエストボディを組み立てる
- `buildFormData()` ヘルパーを各 state の初期値計算用に調整する
- `chartAlertLines` を `useMemo` でラップし、価格条件フィールドのみを依存配列に指定する

## タスク

- [x] T001: `AlertSettingsModal.tsx` の `formData` state を全フィールド個別の `useState` に分割する
- [x] T002: 共通ハンドラ `handleFormChange` を廃止し、各フィールドの setter に置き換える
- [x] T003: `chartAlertLines` を `useMemo` でラップし、価格条件フィールドのみを依存配列に指定する
- [x] T004: `handleSubmit` で各 state を集約してリクエストボディを構築する
- [x] T005: `validateForm()` を分割後の state を参照する形に修正する
- [x] T006: `buildFormData()` ヘルパーを各 state の初期化用に調整する
- [x] T007: 既存ユニットテストを修正・通過確認する
- [x] T008: 通知本文入力時にフリーズしないことをローカルブラウザで手動確認し、画面キャプチャを取得する（E2E の代替確認）

## 参考ドキュメント

- `docs/development/rules.md` — コーディング規約
- `services/stock-tracker/web/tests/unit/components/alert-settings-modal-mode.test.ts`
- `services/stock-tracker/web/tests/unit/components/alert-validation.test.ts`
- `services/stock-tracker/web/tests/unit/components/stock-chart-auto-refresh.test.ts`

## 備考・未決定事項

- `notMerge={true}` の見直し（`false` にすると差分更新になるが副作用要確認）については
  今回の修正スコープ外とする
- E2E テストで再現確認できない場合は、ローカルブラウザでの手動確認を優先する
