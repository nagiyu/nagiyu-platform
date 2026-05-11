# Stock Tracer 予測精度の自動採点・可視化基盤

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に docs/services/stock-tracker/ へ必要な情報を反映し、tasks/stock-tracer-prediction-evaluation/ ディレクトリごと削除します。

    関連 Issue: #3018
    integration ブランチ: integration/3018-stock-tracer-prediction-evaluation
-->

本ディレクトリは Issue #3018「Stock Tracer 予測精度の自動採点・可視化基盤の構築」の作業用一時ドキュメントを格納する。

各作業を別セッションで進めても文脈を失わないよう、設計判断・要件・タスク分割をすべてここに永続化している。**新しいセッションで作業に着手するときは、まず本 README を読んでから対応するドキュメントへ進むこと。**

---

## 1. 背景と目的

現状、Stock Tracer は OpenAI（`gpt-5-mini`）による日次サマリー解析で銘柄ごとに `BULLISH / NEUTRAL / BEARISH` の投資判断シグナルを出力しているが、**予測の自動採点機構が存在しない**ため次の問題がある。

1. 現在の AI 精度を定量化できない（「精度がイマイチ」が体感のまま）
2. 改善施策を打っても効果測定ができない
3. 蓄積データが学習素材として活用されていない

本タスクではこれらを解決する基盤として、**予測 → 翌日実績の自動採点 + ダッシュボード可視化**を構築する。

## 2. AI 改善ロードマップにおける位置付け

本タスクは AI 改善ロードマップ全 4 フェーズの **Phase 1（基盤構築）** に該当する。

| Phase | 概要 | 主な成果物 |
|---|---|---|
| **1**（本タスク） | 自動採点・可視化基盤 | 採点バッチ・ダッシュボード・蓄積データ |
| 2 | 学習サマリー注入 | 過去の成功/失敗を要約した「教訓」をプロンプトに混ぜる |
| 3 | 類似事例 Few-shot（RAG） | 今回の状況に近い過去事例をプロンプトに添付 |
| 4 | ファインチューニング | 蓄積データで小型モデルを専用化、コスト削減も狙う |

Phase 1 の蓄積データはすべて Phase 2〜4 の入力となるため、**データの永続保持**と**生のリターン値も保存して再評価可能にする**ことが重要。

## 3. ディレクトリ構成

| ファイル | 役割 |
|---|---|
| `README.md`（本ファイル） | 入口・全体像・決定事項のラショナル |
| `requirements.md` | 機能要件・非機能要件・受け入れ条件 |
| `external-design.md` | ダッシュボード UI 設計 |
| `design.md` | 技術設計（API・データモデル・コンポーネント設計） |
| `tasks.md` | 実装タスク分割と進捗 |

## 4. 主要な設計判断とラショナル

各判断は事前検討で確定済み。詳細仕様は `requirements.md` および `design.md` を参照。

| # | 項目 | 決定 | 理由 |
|---|---|---|---|
| 1 | 成功判定方式 | 閾値付き方向（固定 0.5%）。生リターン値も保存 | 微小値動きをノイズとして扱える。生値保存で後の再評価が可能 |
| 2 | 保有期間 | 当日終値 → 翌営業日終値（close-to-close、1 日保有） | 標準的・実装最小・後で他ウィンドウを追加可能 |
| 3 | NEUTRAL 扱い | DB は素直に保存。集計は「総合精度 / 方向精度 / NEUTRAL 比率」併記。AI 失敗ケースは集計除外し件数のみ表示 | NEUTRAL は実取引で action なしのため方向精度の方が実用的。両方見たい |
| 4 | スコープ | バックエンド + ダッシュボード。過去データ遡及は別 Issue | スコープを絞って Phase 1 を最短で完了し、Phase 2 に進める |
| 5 | 判定タイミング | 新規独立 Lambda、EventBridge cron で 1 時間毎起動。「未判定 & 翌営業日引け済」のみ処理 | 既存バッチとの責務分離。複数取引所を 1 つの cron でカバーできる |
| 6 | ダッシュボード | 既存 web に新規ページ。レベル 2（KPI / 推移 / シグナル別 / 銘柄別 / 取引所別） | 全体精度だけでなく「どこが悪いか」まで見えないと改善の手がかりにならない |
| 7 | データ保持 | 永続保持（TTL なし） | Phase 2〜4 の学習素材として活用。古いデータほど価値があるケースもある |
| 8 | 採点結果の格納方式 | 既存 `DailySummaryEntity` に Evaluation\* optional フィールドとして統合（独立エンティティを作らない） | キーが `(TickerID, Date)` で完全一致するため独立化のメリットが薄く、既存 `AiAnalysisResult` 同様 "後から付与される派生属性" のパターンに合わせる。新規 GSI 追加が不要になり Phase 1 の着手コストも下がる |

## 5. スコープ

### 含む

- 既存 `DailySummaryEntity` への Evaluation\* フィールド追加（採点結果の格納先。詳細は §4 項目 8 / `design.md` §2.1 参照）
- 採点ロジック（純粋関数）
- 採点バッチ Lambda + EventBridge cron（1 時間毎）
- 精度集計 API（既存 web の API Routes）
- ダッシュボード UI（既存 stock-tracker web に新規ページ）
- 各レイヤのユニットテスト（カバレッジ 80% 以上）

### 含まない（別 Issue）

- 既に蓄積済みの `AiAnalysisResult` への遡及採点
- ボラティリティ調整による動的閾値
- Phase 2 以降の改善機構（教訓蒸留 / RAG / ファインチューニング）

## 6. ブランチ戦略

```
develop
  └── integration/3018-stock-tracer-prediction-evaluation
        ├── claude/3018-design-docs       (作業 0: 本ドキュメント群)
        ├── claude/3018-ui-poc            (作業 1: UI PoC / モックデータ)
        ├── claude/3018-refine-docs       (作業 2: PoC FB を反映して要件再確定)
        ├── claude/3018-entity            (作業 3)
        ├── claude/3018-judge-logic       (作業 4)
        ├── claude/3018-batch             (作業 5)
        ├── claude/3018-api               (作業 6)
        ├── claude/3018-ui-wire           (作業 7: UI を本物の API に接続)
        └── claude/3018-docs-finalize     (作業 8: docs/ 統合 & tasks/ 配下削除)
```

各作業は **integration ブランチへ Draft PR** を出す。作業 8 まで integration 上で完了させ、人の確認を経て **integration → develop の Draft PR** を作成する。develop には完成形のみ（`docs/` 更新済み + `tasks/` 配下なし）が入る。

### UI 先行（PoC）方式

実物の UI を見るまで指標の取捨選択や見せ方の微調整は判断しきれないため、作業 1 で UI を先回しに PoC として実装し、作業 2 でレビュー FB を反映して要件・設計を再確定してから backend 着手する。これにより API スキーマ・集計ロジックの後戻りを最小化する。

## 7. 作業着手時の手順（次セッション向け）

新しいセッションで作業 N に着手する場合：

1. 本 README を一読し、対象タスクの位置付けを確認
2. `requirements.md` で対象タスクの受け入れ条件を確認（**作業 3 以降は作業 2 で再確定された版を参照**）
3. `design.md` で対象タスクが触れる設計詳細を確認（同上、API スキーマ・Evaluation\* フィールドは作業 2 後の版が確定版）
4. `tasks.md` で対象タスクの依存関係・完了条件を確認
5. integration ブランチから作業ブランチを切る
   ```bash
   git fetch origin integration/3018-stock-tracer-prediction-evaluation
   git checkout -b claude/3018-<slug> origin/integration/3018-stock-tracer-prediction-evaluation
   ```
6. 実装 → コミット → push → integration への Draft PR
7. 完了後、`tasks.md` の進捗チェックを更新する PR を併せて出すか、本作業 PR の中で更新する

### 作業 2 の進め方（補足）

作業 2 は実装コードを伴わないドキュメント PR。dev 環境にデプロイされた作業 1 の PoC を人に確認してもらい、FB を集めて `requirements.md` / `external-design.md` /（必要なら）`design.md` を更新する。FB 収集は issue コメント or チャットで行い、得られた指摘とその反映方針を PR 本文にまとめる。

## 8. 関連リンク

- Issue: [#3018](https://github.com/nagiyu/nagiyu-platform/issues/3018)
- 既存コード参照
    - `services/stock-tracker/batch/src/lib/openai-client.ts` — 既存 AI 呼び出し
    - `services/stock-tracker/batch/src/summary.ts` — 既存サマリーバッチ
    - `services/stock-tracker/core/src/entities/daily-summary.entity.ts` — 既存エンティティ
    - `services/stock-tracker/core/src/services/trading-hours-checker.ts` — 取引時間判定
    - `services/stock-tracker/core/src/services/tradingview-client.ts` — TradingView API クライアント
- プロジェクトルール
    - [`docs/branching.md`](../../docs/branching.md)
    - [`docs/development/architecture.md`](../../docs/development/architecture.md)
    - [`docs/development/rules.md`](../../docs/development/rules.md)
    - [`docs/development/testing.md`](../../docs/development/testing.md)
    - [`CLAUDE.md`](../../CLAUDE.md)
