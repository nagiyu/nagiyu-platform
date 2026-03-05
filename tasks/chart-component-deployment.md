# チャートのコンポーネント化と展開

## 概要

stock-tracker サービスにおいて、`StockChart` コンポーネントを複数画面へ展開する。
調査の結果、チャートのコンポーネント化（`StockChart.tsx`）はすでに完了している。
現状はホームページのみで使用されており、アラート設定ダイアログ（`AlertSettingsModal`）および
サマリー画面（`summaries/page.tsx`）へのチャート表示組み込みが未実装のため、これを対応する。

## 関連情報

- Issue: チャートのコンポーネント化と展開
- タスクタイプ: サービスタスク（stock-tracker-web）
- 対象サービス: `services/stock-tracker/web`

## 現状分析

### StockChart コンポーネント（実装済み）

| 項目 | 内容 |
|------|------|
| ファイル | `services/stock-tracker/web/src/components/StockChart.tsx` |
| ライブラリ | Apache ECharts（`echarts` + `echarts-for-react`） |
| チャート種別 | ローソク足 + 出来高バー |
| Props | `tickerId: string`, `timeframe: Timeframe`, `count?: ChartBarCount` |
| データ取得 | `/api/chart/{tickerId}?timeframe=...&count=...` |
| 現在の使用箇所 | `HomePageClient.tsx` のみ |

### チャートが未組み込みの画面

| 画面 | ファイル | 状況 |
|------|---------|------|
| アラート設定ダイアログ | `src/components/AlertSettingsModal.tsx` | `tickerId` は受け取るがチャートなし |
| サマリー画面 | `app/summaries/page.tsx` | テーブル表示のみ、チャートなし |
| サマリー詳細モーダル | `app/summaries/page.tsx`（インライン） | パターン分析テーブル＋AI解析のみ |

## 要件

### 機能要件

- FR1: `AlertSettingsModal` にチャートセクションを追加し、対象ティッカーのローソク足チャートを表示する
    - 初期表示時にデフォルトの時間枠・本数でチャートを描画する
    - 時間枠・表示本数の切り替えコントロールを提供する（ホームページと同等）
- FR2: サマリー画面（`summaries/page.tsx`）のティッカー詳細モーダルにチャートセクションを追加する
    - モーダルを開いた際に対象ティッカーのチャートを表示する
    - 時間枠は「日足」固定、表示本数は「50本」固定とし、切り替えコントロールは不要
- FR3: 既存の `StockChart` コンポーネントをそのまま再利用する（新規実装なし）
- FR4: 既存のアラート設定・サマリー閲覧の機能・動作を変更しない

### 非機能要件

- NFR1: TypeScript strict mode 準拠
- NFR2: テストカバレッジ 80% 以上（変更コンポーネントのユニットテスト・E2E テストを追加・更新）
- NFR3: 既存ユニットテスト・E2E テストがすべて通過すること
- NFR4: モバイル（スマホファースト）での表示・操作に対応すること
- NFR5: チャートのローディング中・エラー時のフォールバック表示を維持すること

## 実装のヒント

### AlertSettingsModal へのチャート追加

- `AlertSettingsModal` の既存 Props（`tickerId`, `exchangeId`, `symbol`）はすでに存在するため、
  `StockChart` に渡す `tickerId` は Props から取得できる
- ダイアログ内で状態として `timeframe: Timeframe` と `count: ChartBarCount` を管理し、
  ホームページと同様の切り替えコントロールを配置する
- ダイアログのサイズ（`maxWidth`）はチャートが見やすくなるよう `md` 以上への拡張を検討する
- チャートセクションはフォームセクションの上部（または切り替え可能なタブ）に配置する

### サマリー詳細モーダルへのチャート追加

- `summaries/page.tsx` のティッカー詳細モーダルは `selectedTicker` 変数を持っており、
  `tickerId` の取得は容易である
- モーダル内のコンテンツ上部にチャートセクションを追加する
- 時間枠は「日足（`1d`）」固定、表示本数は「50本」固定とする（状態管理・切り替えコントロール不要）
- 既存のパターン分析テーブル・AI 解析テキストは変更しない

### 参考: ホームページのチャート実装

- `HomePageClient.tsx` が時間枠・表示本数の状態管理・UI コントロール・`StockChart` 呼び出しを実装している
- アラート設定ダイアログには同パターンを適用する
- サマリー詳細モーダルは固定値（`timeframe="1d"`, `count={50}`）で `StockChart` を呼び出すだけでよい

## タスク

### Phase 1: AlertSettingsModal へのチャート追加

- [ ] T001: `AlertSettingsModal.tsx` に `timeframe` / `count` の状態を追加する
- [ ] T002: 時間枠・表示本数の切り替えコントロール UI を追加する（`HomePageClient` のパターンを参考）
- [ ] T003: `StockChart` コンポーネントをダイアログ内に組み込む
- [ ] T004: ダイアログサイズを `StockChart` が適切に表示されるよう調整する
- [ ] T005: 既存のフォーム・送信ロジックが変更されていないことを確認する

### Phase 2: サマリー画面詳細モーダルへのチャート追加

- [ ] T006: `summaries/page.tsx` のティッカー詳細モーダルに `StockChart` を組み込む（`timeframe="1d"`, `count={50}` 固定）
- [ ] T007: モーダルサイズを `StockChart` が適切に表示されるよう調整する
- [ ] T008: 既存のパターン分析テーブル・AI 解析テキストが変更されていないことを確認する

### Phase 3: テスト

- [ ] T009: `tests/unit/AlertSettingsModal.test.tsx` にチャートセクション表示のテストを追加する
- [ ] T010: `tests/unit/summaries-page.test.tsx`（または相当するテストファイル）にチャートセクション表示のテストを追加する
- [ ] T011: `tests/e2e/` に、アラート設定ダイアログおよびサマリー詳細モーダルでのチャート表示テストを追加する

### Phase 4: 品質チェック

- [ ] T012: TypeScript コンパイルエラーがないことを確認する（`npm run build`）
- [ ] T013: ESLint エラーがないことを確認する（`npm run lint`）
- [ ] T014: Prettier フォーマットが統一されていることを確認する（`npm run format:check`）
- [ ] T015: テストカバレッジが 80% 以上であることを確認する

## 参考ドキュメント

- `docs/development/rules.md` - コーディング規約
- `docs/development/architecture.md` - アーキテクチャ方針
- `docs/services/stock-tracker/architecture.md` - stock-tracker アーキテクチャ
- `docs/development/testing.md` - テスト戦略

## 備考・未決定事項

- `AlertSettingsModal` は既に大規模ファイル（約 40 KB）であるため、チャートセクション追加後の
  コンポーネント分割（例: `AlertSettingsModalChart.tsx` への切り出し）を検討してもよい
- モバイル環境でのダイアログ内チャート表示は画面サイズの制約があるため、
  スクロール対応またはチャートの高さ制限が必要になる可能性がある
