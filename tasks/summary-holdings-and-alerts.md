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

- 保有中: `✓`（チェック）
- 未保有: `-`（ハイフン）

#### FR2: 保有詳細の詳細ダイアログ表示

詳細ダイアログ（行クリックで開くモーダル）に以下の情報を追加表示する。

- 保有数（quantity）
- 平均取得価格（averagePrice）
- 当該銘柄を保有していない場合は、これらの項目を `-`（ハイフン）で表示する

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
- **NFR2**: TypeScript strict mode を維持する
- **NFR3**: テストカバレッジ 80% 以上を維持する
- **NFR4**: エラーメッセージは `ERROR_MESSAGES` 定数で管理する

---

## 実装方針

### データ取得戦略

`/api/summaries` の内部ロジックで保有株式データ（`/api/holdings` 相当）を取得し、レスポンスに保有情報を含める。
フロントエンドはサマリー API の 1 回のコールのみでサマリー + 保有情報をまとめて受け取れる。
これにより、保有株式データ構造の変更時にビルドエラーとして影響範囲を検知できる。

概念的表現:

```typescript
// API レスポンス型（概念的表現）
TickerSummary に保有情報フィールドを追加:
  holding: { quantity: number; averagePrice: number } | null
```

フロントエンド側の `holdingMap` は不要となり、`summary.holding` を直接参照する。

### 型拡張方針

`types/stock.ts` の `TickerSummary` 型に `holding` フィールドを追加する。
保有中の場合は `{ quantity: number; averagePrice: number }` を、未保有の場合は `null` とする。
これにより TypeScript の型チェックで保有情報の取り扱い漏れをコンパイル時に検知できる。

### コンポーネント変更方針

`summaries/page.tsx` に対して以下の変更を加える。

- データ取得: `/api/summaries` の 1 回のコールのみ（`holdingMap` State は不要）
- 一覧テーブル: 「保有」列を追加し、`summary.holding !== null` で表示を切り替える
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

### フェーズ 1: サマリー API への保有情報統合

- [x] T001: `types/stock.ts` の `TickerSummary` 型に `holding` フィールドを追加する
    - 型: `holding: { quantity: number; averagePrice: number } | null`
- [x] T002: `app/api/summaries/route.ts` の内部ロジックで保有株式データを取得し、レスポンスに `holding` を含める
    - サマリー構築時に保有株式 DB（または `/api/holdings` 相当のロジック）を参照する
    - 保有データ取得失敗時は `holding: null` として扱い、サマリー取得全体をブロックしない
    - `ERROR_MESSAGES` に `FETCH_HOLDINGS_FAILED` を追加する

### フェーズ 2: 保有株式情報の表示

- [x] T003: 一覧テーブルに「保有」列ヘッダーを追加する
    - 位置は「銘柄名」と「始値」の間などに配置する（UX 的に自然な位置）
- [x] T004: 一覧の各行で `summary.holding !== null` を使い保有マークを表示する
    - 保有中: `✓`（チェック）
    - 未保有: `-`（ハイフン）
- [x] T005: 詳細ダイアログの基本情報テーブルに保有情報行を追加する
    - `selectedTicker.holding` が非 null の場合のみ以下を表示する
        - 保有数: `quantity`（数値フォーマット）
        - 平均取得価格: `averagePrice`（小数点 2 桁表示）
    - 存在しない場合は `-`（ハイフン）を表示する

### フェーズ 3: アラート設定ボタンの追加

- [x] T006: `summaries/page.tsx` に `isBuyAlertOpen`, `isSellAlertOpen` の State を追加する
- [x] T007: `AlertSettingsModal` をインポートする
- [x] T008: 詳細ダイアログに「買いアラート設定」ボタンを追加する
    - 全銘柄に表示する（保有有無を問わない）
    - クリックで `isBuyAlertOpen = true` にセットする
- [x] T009: 詳細ダイアログに「売りアラート設定」ボタンを追加する
    - `selectedTicker.holding` が非 null の場合のみ売りアラートボタンを表示する
    - クリックで `isSellAlertOpen = true` にセットする
- [x] T010: `AlertSettingsModal` を 2 つ（Buy / Sell）配置する
    - `tickerId`, `symbol`, `exchangeId`, `mode`, `defaultTargetPrice`（close 値）, `basePrice`（close 値）を渡す
    - `onClose` で対応する `isAlertOpen` を false にする
    - `onSuccess` でスナックバーやフィードバック表示を行う（任意）

### フェーズ 4: テスト追加・更新

- [x] T011: `tests/unit/app/summaries-page.test.ts` を更新する
    - 保有中マークが表示されることを確認するテストを追加する
    - 詳細ダイアログに保有数・平均取得価格が表示されることを確認するテストを追加する
    - 買いアラートボタンが全銘柄で表示されることを確認するテストを追加する
    - 売りアラートボタンが保有銘柄のみ表示されることを確認するテストを追加する
- [x] T012: `tests/e2e/summary-display.spec.ts` を更新する
    - 保有情報の表示シナリオを追加する（サマリー API モックに holding フィールドを含める）
    - アラート設定モーダルが開くシナリオを追加する

---

## 影響ファイル一覧

| ファイル | 変更種別 |
|---|---|
| `services/stock-tracker/web/types/stock.ts` | 変更（`TickerSummary` に `holding` フィールド追加） |
| `services/stock-tracker/web/app/api/summaries/route.ts` | 変更（内部で保有情報を取得・付与） |
| `services/stock-tracker/web/app/summaries/page.tsx` | 変更（主要変更先） |
| `services/stock-tracker/web/tests/unit/app/summaries-page.test.ts` | 変更 |
| `services/stock-tracker/web/tests/e2e/summary-display.spec.ts` | 変更 |

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
- **保有株式取得のページネーション**: 保有銘柄が多い場合は全件取得のループが必要になるが、一般的な利用シナリオでは 50 件以内に収まると想定し、Phase 1 では簡易実装とする
