# サマリー画面の改善：保有株式情報表示とアラート設定

## 概要

サマリー画面（`/summaries`）に対して以下 2 つの機能を追加する。

1. **保有株式情報の表示**: サマリー一覧・詳細ダイアログに保有株式の情報を組み込む
2. **アラート設定**: サマリー画面からワンクリックでアラートを登録できるようにする

## 関連情報

- Issue: サマリーの改善
- タスクタイプ: サービスタスク（stock-tracker-web）
- 対象ディレクトリ: `services/stock-tracker/web/`

## 現状把握

### サマリー画面の構成

| ファイル | 役割 |
|---|---|
| `app/summaries/page.tsx` | サマリー一覧 + 詳細ダイアログを持つクライアントコンポーネント（455行） |
| `app/api/summaries/route.ts` | サマリー取得 API（取引所別・ティッカー別にデータを返す） |
| `types/stock.ts` | フロントエンド型定義（`TickerSummary`, `SummariesResponse` など） |

### 既存の保有株式・アラート機能

| ファイル | 役割 |
|---|---|
| `app/api/holdings/route.ts` | `GET /api/holdings` で保有株式一覧を返す（`tickerId`, `quantity`, `averagePrice` を含む） |
| `app/api/alerts/route.ts` | `POST /api/alerts` でアラートを作成する |
| `components/AlertSettingsModal.tsx` | アラート新規作成モーダル（`holdings/page.tsx` などで既に利用） |

### `AlertSettingsModal` のインターフェース（抜粋）

```typescript
props:
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  tickerId: string
  symbol: string
  exchangeId: string
  mode: 'Buy' | 'Sell'
  defaultTargetPrice?: number
  basePrice?: number
```

### 一覧テーブルの現状列構成

| シンボル | 銘柄名 | 始値 | 高値 | 安値 | 終値 | 買いシグナル | 売りシグナル |

### 詳細ダイアログの現状構成

- 銘柄名 / 始値 / 高値 / 安値 / 終値 / 更新日時
- パターン分析（買い・売り）
- AI 解析テキスト

---

## 要件

### 機能要件

#### FR1: 保有可否の一覧表示

一覧テーブルに「保有」列を追加し、ユーザーが当該銘柄を保有している場合に保有中であることを視覚的に示す。

- 保有中: チェックマークやアイコン等で明示
- 未保有: 空欄またはそれに準じた表示

#### FR2: 保有詳細の詳細ダイアログ表示

詳細ダイアログ（行クリックで開くモーダル）に以下の情報を追加表示する。

- 保有数（quantity）
- 平均取得価格（averagePrice）
- 当該銘柄を保有していない場合は、これらの項目を非表示または「未保有」と表示する

#### FR3: 買いアラートの設定

詳細ダイアログ内に「買いアラート設定」ボタンを追加する。

- 全銘柄で表示する（保有有無を問わない）
- ボタンクリックで既存の `AlertSettingsModal`（`mode="Buy"`）を開く
- `defaultTargetPrice` には現在の終値（`close`）を渡す

#### FR4: 売りアラートの設定

詳細ダイアログ内に「売りアラート設定」ボタンを追加する。

- **保有中の銘柄のみ**ボタンを表示する
- ボタンクリックで `AlertSettingsModal`（`mode="Sell"`）を開く
- `defaultTargetPrice` には現在の終値（`close`）を渡す

### 非機能要件

- **NFR1**: 保有株式データの取得失敗時はサマリー表示をブロックしない（graceful degradation）
- **NFR2**: 保有株式 API 呼び出しはサマリー API と並列で実行し、表示遅延を最小化する
- **NFR3**: TypeScript strict mode を維持する
- **NFR4**: テストカバレッジ 80% 以上を維持する
- **NFR5**: エラーメッセージは `ERROR_MESSAGES` 定数で管理する

---

## 実装方針

### データ取得戦略

`useEffect` でのデータ取得時に `/api/summaries` と `/api/holdings` を `Promise.all` で並列取得する。
取得した保有株式の `tickerId` セットをフロントエンド側でインメモリ保持し、サマリーの各行に照合する。
保有株式 API の失敗は `console.warn` を出力しつつ空セットとして扱い、保有情報は「不明」扱いとする。

概念的表現:

```typescript
// 概念的表現（擬似コード）
[summariesData, holdingsData] = await Promise.all([
    fetch('/api/summaries'),
    fetch('/api/holdings').catch(() => null)  // 失敗時は null
])
holdingMap = Map<tickerId, { quantity, averagePrice }>
```

### 型拡張方針

`types/stock.ts` には UI 表示用の型のみ定義する方針を維持する。
保有情報は `TickerSummary` に追加せず、ページコンポーネント内でローカルな Map 型として管理する。
これにより `TickerSummary` 型（API レスポンス型）の変更を不要とする。

### コンポーネント変更方針

`summaries/page.tsx` に対して以下の変更を加える。

- State 追加: `holdingMap: Map<string, { quantity: number; averagePrice: number }>` を追加
- データ取得: `fetchSummaries` の内部または並列の別 `useCallback` として `fetchHoldings` を実装
- 一覧テーブル: 「保有」列を追加し、`holdingMap.has(tickerId)` で表示を切り替える
- 詳細ダイアログ: 保有情報セクション（保有数・平均取得価格）を条件付き表示で追加
- 詳細ダイアログ: アラート設定ボタンエリアを追加（買いは常時・売りは保有時のみ）
- `AlertSettingsModal` をインポートし、買い/売りそれぞれの open 状態を State で管理する

### アラートモーダル管理

`selectedTicker` が選択されている状態でアラートボタンをクリックすると、
詳細ダイアログを維持したまま `AlertSettingsModal` を重ね表示するか、
または詳細ダイアログを閉じてからモーダルを開くか、UX 上の判断が必要。

推奨方針: 詳細ダイアログを開いたまま `AlertSettingsModal` を重ね表示する。
`AlertSettingsModal` の `onClose` で `AlertSettingsModal` のみを閉じ、詳細ダイアログは維持する。

```typescript
// State（概念的表現）
State:
  isBuyAlertOpen: boolean
  isSellAlertOpen: boolean
```

---

## タスク

### フェーズ 1: 保有株式データの取得・状態管理

- [ ] T001: `summaries/page.tsx` に `holdingMap` の State を追加する
    - 型: `Map<string, { quantity: number; averagePrice: number }>`
    - 初期値: `new Map()`
- [ ] T002: `/api/holdings` を呼び出す `fetchHoldings` 関数を実装する
    - `Promise.all` でサマリー取得と並列実行する
    - 失敗時は空の Map として扱い、エラーはサマリー表示をブロックしない
    - `ERROR_MESSAGES` に `FETCH_HOLDINGS_FAILED` を追加する
- [ ] T003: `useEffect` 内で `fetchSummaries` と `fetchHoldings` を並列実行するよう変更する

### フェーズ 2: 保有株式情報の表示

- [ ] T004: 一覧テーブルに「保有」列ヘッダーを追加する
    - 位置は「銘柄名」と「始値」の間などに配置する（UX 的に自然な位置）
- [ ] T005: 一覧の各行で `holdingMap.has(summary.tickerId)` を使い保有マークを表示する
    - 保有中: チェックアイコン（`CheckCircle` 等の MUI アイコン）または `○`
    - 未保有: 空欄
- [ ] T006: 詳細ダイアログの基本情報テーブルに保有情報行を追加する
    - `holdingMap.get(tickerId)` が存在する場合のみ以下を表示する
        - 保有数: `quantity`（数値フォーマット）
        - 平均取得価格: `averagePrice`（小数点 2 桁表示）
    - 存在しない場合は行自体を非表示とする

### フェーズ 3: アラート設定ボタンの追加

- [ ] T007: `summaries/page.tsx` に `isBuyAlertOpen`, `isSellAlertOpen` の State を追加する
- [ ] T008: `AlertSettingsModal` をインポートする
- [ ] T009: 詳細ダイアログに「買いアラート設定」ボタンを追加する
    - 全銘柄に表示する（保有有無を問わない）
    - クリックで `isBuyAlertOpen = true` にセットする
- [ ] T010: 詳細ダイアログに「売りアラート設定」ボタンを追加する
    - `holdingMap.has(selectedTicker.tickerId)` が true の場合のみ表示する
    - クリックで `isSellAlertOpen = true` にセットする
- [ ] T011: `AlertSettingsModal` を 2 つ（Buy / Sell）配置する
    - `tickerId`, `symbol`, `exchangeId`, `mode`, `defaultTargetPrice`（close 値）, `basePrice`（close 値）を渡す
    - `onClose` で対応する `isAlertOpen` を false にする
    - `onSuccess` でスナックバーやフィードバック表示を行う（任意）

### フェーズ 4: テスト追加・更新

- [ ] T012: `tests/unit/app/summaries-page.test.ts` を更新する
    - 保有中マークが表示されることを確認するテストを追加する
    - 詳細ダイアログに保有数・平均取得価格が表示されることを確認するテストを追加する
    - 買いアラートボタンが全銘柄で表示されることを確認するテストを追加する
    - 売りアラートボタンが保有銘柄のみ表示されることを確認するテストを追加する
- [ ] T013: `tests/e2e/summary-display.spec.ts` を更新する
    - 保有情報の表示シナリオを追加する（holdings API モック）
    - アラート設定モーダルが開くシナリオを追加する

---

## 影響ファイル一覧

| ファイル | 変更種別 |
|---|---|
| `services/stock-tracker/web/app/summaries/page.tsx` | 変更（主要変更先） |
| `services/stock-tracker/web/tests/unit/app/summaries-page.test.ts` | 変更 |
| `services/stock-tracker/web/tests/e2e/summary-display.spec.ts` | 変更 |

> `types/stock.ts` および API ルート（`/api/summaries`, `/api/holdings`）の変更は不要。

---

## 参考ドキュメント

- コーディング規約: `docs/development/rules.md`
- `AlertSettingsModal` の利用例: `services/stock-tracker/web/app/holdings/page.tsx`
- 保有株式 API 実装: `services/stock-tracker/web/app/api/holdings/route.ts`

---

## 備考・未決定事項

- **保有列の位置**: 「銘柄名」の直後が視認性が高いが、テーブルの横幅への影響を考慮して決定する
- **詳細ダイアログのアラートボタン配置**: AI 解析セクションの上か下かは実装時に判断する。誤操作防止のため `Divider` で区切ることを推奨する
- **アラート設定成功後のフィードバック**: 既存の `SnackbarProvider` を使うか、簡易な `Alert` コンポーネントにするかは実装時に判断する
- **保有株式 API のページネーション**: `GET /api/holdings` はデフォルト 50 件取得。保有銘柄が多い場合は全件取得のループが必要になるが、一般的な利用シナリオでは 50 件以内に収まると想定し、Phase 1 では簡易実装とする
