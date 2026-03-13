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

フォーム全体を単一 state で管理していることが根本原因のため、以下の 2 方針を検討する。

### 方針A（推奨）: state をチャート関連／通知テキストで分離する

チャート描画に関係するフィールド（価格条件）と、関係しないフィールド（通知テキスト・有効化等）の
state を分離することで、通知テキスト変更時にチャート関連の再レンダリングが発生しなくなる。

**概念的なイメージ**:

```
// チャート描画に関係する state（変更時に chartAlertLines を再計算）
conditionMode, operator, targetPrice, rangeType, minPrice, maxPrice,
inputMode, percentage, rangeInputMode, minPercentage, maxPercentage

// チャート描画に関係しない state（変更してもチャートに影響しない）
notificationTitle, notificationBody, frequency, enabled, temporary
```

**変更対象**: `services/stock-tracker/web/components/AlertSettingsModal.tsx`

- `formData` state を複数の state に分割する（例: `chartFields`, `notificationTitle`,
  `notificationBody`, `frequency`, `enabled`, `temporary`）
- `handleFormChange` の共通ハンドラを廃止し、各フィールド（グループ）ごとの setter を使う
- `handleSubmit` 時に各 state を集約してリクエストボディを組み立てる
- `buildFormData()` ヘルパーを各 state の初期値計算用に分割または調整する
- `chartAlertLines` の依存はチャート関連 state のみになり、`useMemo` なしでも自然に最適化される

**メリット**:
- 通知テキスト変更時にチャートが一切再描画されなくなる（根本解決）
- React の慣用的なパターンに沿う
- チャート関連 state のみに依存することで、依存関係が明示的になる

**デメリット**:
- 大規模なコンポーネント（約 1,500 行）のリファクタリングが必要
- `validateForm()` 内で各 state を参照する形に修正が必要
- 既存テストの修正が必要になる可能性がある

---

### 方針B（軽量対応）: `useMemo` で chartAlertLines の再計算を抑制する

方針A のリファクタリングコストが高い場合の代替として、`chartAlertLines` を `useMemo` でラップし、
依存配列を価格条件フィールドのみに限定することで通知テキスト変更時の StockChart 再描画を防ぐ。

**変更対象 1**: `services/stock-tracker/web/components/AlertSettingsModal.tsx`

- `useState`, `useEffect` の import に `useMemo` を追加する
- Line 297 の `chartAlertLines` 計算を `useMemo` でラップし、依存配列に
  価格条件フィールド（`conditionMode`, `operator`, `targetPrice`, `rangeType`,
  `minPrice`, `maxPrice`）のみを指定する

**変更対象 2**: `services/stock-tracker/web/components/StockChart.tsx`

- `useEffect`, `useRef` の import に `useMemo` を追加する
- `getChartOption()` 関数呼び出しを `useMemo` でラップし、依存配列に
  `chartData`, `holdingPrice`, `alertLines` を指定する

**メリット**:
- 変更規模が小さく、既存テストへの影響が少ない

**デメリット**:
- `useMemo` の依存配列を誤ると気づきにくいバグになる
- 根本原因（単一 state の問題）は残るため、将来的に同様の問題が再発し得る

---

### 推奨方針の決定

**方針A を推奨する**。ただし、変更規模や既存テストへの影響を踏まえて実装担当者が最終判断すること。

| 観点 | 方針A（state分離） | 方針B（useMemo） |
|------|-------------------|-----------------|
| 根本解決 | ✅ | ❌（対症療法） |
| 変更規模 | 大 | 小 |
| テスト影響 | 要修正の可能性あり | 低リスク |
| 将来的な安全性 | 高 | 低 |

## タスク

### 方針A（推奨）: state 分離

- [ ] T001-A: `AlertSettingsModal.tsx` の state をチャート関連フィールドと通知・設定フィールドに分割する
- [ ] T002-A: 共通ハンドラ `handleFormChange` を廃止し、各フィールドグループの setter に置き換える
- [ ] T003-A: `handleSubmit` で各 state を集約してリクエストボディを構築する
- [ ] T004-A: `validateForm()` を分割後の state を参照する形に修正する
- [ ] T005-A: `buildFormData()` ヘルパーを各 state の初期化用に調整する
- [ ] T006-A: 既存ユニットテストを修正・通過確認する
- [ ] T007-A: E2E テストで通知テキスト入力時に画面が固まらないことを確認する

### 方針B（代替）: useMemo 対応

- [ ] T001-B: `AlertSettingsModal.tsx` の `chartAlertLines` 計算を `useMemo` でラップする
- [ ] T002-B: `StockChart.tsx` の `getChartOption()` 呼び出しを `useMemo` でラップする
- [ ] T003-B: 既存ユニットテストが通ることを確認する
- [ ] T004-B: E2E テストで通知テキスト入力時に画面が固まらないことを確認する

## 参考ドキュメント

- `docs/development/rules.md` — コーディング規約
- `services/stock-tracker/web/tests/unit/components/alert-settings-modal-mode.test.ts`
- `services/stock-tracker/web/tests/unit/components/alert-validation.test.ts`
- `services/stock-tracker/web/tests/unit/components/stock-chart-auto-refresh.test.ts`

## 備考・未決定事項

- 方針A（state 分離）と方針B（useMemo）のどちらを採用するか最終判断は実装担当者に委ねる
- `notMerge={true}` の見直し（`false` にすると差分更新になるが副作用要確認）については
  今回の修正スコープ外とする
- E2E テストで再現確認できない場合は、ローカルブラウザでの手動確認を優先する
