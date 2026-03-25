# Stock Tracker 改善 - 技術設計（Issue #2371）

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/services/stock-tracker/architecture.md に ADR として抽出し、
    tasks/issue-2371-stock-tracker-improvements/ ディレクトリごと削除します。

    入力: tasks/issue-2371-stock-tracker-improvements/requirements.md
    次に作成するドキュメント: tasks/issue-2371-stock-tracker-improvements/tasks.md
-->

## 変更対象モジュール一覧

本改修は以下の 4 つの変更領域に分かれる。

| 領域 | 変更種別 | 主な変更内容 |
|------|---------|------------|
| Batch: temporary-alert-expiry | ロジック変更 | 無効化 → 削除 |
| Batch: openai-client | プロンプト・API オプション変更 | Web 検索強制 |
| Web: トップ画面（SCR-001） | UI 変更・機能追加 | サマリーパネル刷新、保有・アラート CRUD 追加 |
| Web: サマリー詳細ダイアログ（SCR-004） | バグ修正 | モバイル横幅オーバー修正 |

---

## コンポーネント設計

### パッケージ責務分担

| パッケージ | 責務 |
|----------|------|
| `stock-tracker/batch` | バッチ処理（一時アラート失効・AI 解析生成） |
| `stock-tracker/web` | UI・API Routes |
| `stock-tracker/core` | ビジネスロジック・リポジトリインターフェース（今回変更なし） |

### 変更モジュール一覧

**batch**

| モジュール | パス | 変更内容 |
|----------|------|---------|
| `temporaryAlertExpiry` | `batch/src/temporary-alert-expiry.ts` | `alertRepo.update(... { Enabled: false })` を `alertRepo.delete(userId, alertId)` に置換 |
| `buildAnalysisPrompt` / OpenAI 呼び出し | `batch/src/lib/openai-client.ts` | `tool_choice: 'required'` 追加、`relatedMarketTrend` プロンプト文言変更 |

**web**

| モジュール | パス | 変更内容 |
|----------|------|---------|
| トップ画面 | `web/src/app/` 配下のトップページコンポーネント | サマリーパネル表示項目変更・詳細ボタン追加 |
| 日次サマリーパネル | `web/src/components/` 配下のサマリーパネルコンポーネント | 表示項目を投資判断・シグナル・AI判定・更新時間・サポート/レジスタンスに変更 |
| 保有株式パネル | `web/src/components/` 配下の保有株式パネルコンポーネント | 追加・編集・削除ボタンを追加し、SCR-002 のダイアログを流用 |
| アラートパネル | `web/src/components/` 配下のアラートパネルコンポーネント | 追加・編集・削除ボタンを追加し、SCR-003 のダイアログを流用 |
| サマリー詳細ダイアログ | `web/src/components/` 配下の詳細ダイアログコンポーネント | モバイル幅オーバーフローの修正 |

---

## 変更詳細

### 1. 一時アラート失効処理（batch/src/temporary-alert-expiry.ts）

**変更前の処理概念**:
- 期限切れアラートを取得
- 各アラートに対して `alertRepo.update(userId, alertId, { Enabled: false })` を呼ぶ

**変更後の処理概念**:
- 期限切れアラートを取得
- 各アラートに対して `alertRepo.delete(userId, alertId)` を呼ぶ

**インターフェース変更**: なし（`AlertRepository` に `delete` メソッドは既存）

**エラーハンドリング**: 既存方針を維持（個別失敗はログ出力してスキップ、後続継続）

**テスト変更**:
- `batch/tests/unit/temporary-alert-expiry.test.ts` のモック検証を `update` → `delete` に変更

---

### 2. AI 解析 Web 検索強制（batch/src/lib/openai-client.ts）

**変更点 1: `tool_choice` の追加**

OpenAI Responses API の呼び出しオプションに `tool_choice: 'required'` を追加する。
これにより `tools: [{ type: 'web_search' }]` が設定されているリクエストで Web 検索が必ず実行される。

**変更点 2: プロンプト文言の修正**

`relatedMarketTrend` フィールドの説明を「必要に応じてWeb検索を利用」から「必ずWeb検索を利用して最新情報を取得すること」に変更する。

**変更点 3: ニュース収集指示の追加（任意）**

可能であれば、プロンプトに「決算発表・重要経済指標など直近で動向が変わる可能性のあるニュースも根拠として含めること」という指示を追加する。

**注意事項**:
- `tool_choice: 'required'` は OpenAI Responses API では `'auto' | 'required' | 'none' | { type: 'function'; function: { name: string } }` で指定する
- Web 検索強制により応答時間・コストが増加する可能性があるが、情報の鮮度を優先する

**テスト変更**:
- `batch/tests/unit/openai-client.test.ts` の呼び出しオプションに `tool_choice: 'required'` が含まれることを検証するアサーションを追加

---

### 3. トップ画面 サマリーパネル刷新（web）

**表示データのマッピング**:

| 表示項目 | 取得元フィールド（概念） |
|---------|-------------------|
| 投資判断 | `DailySummary.investmentJudgment` 相当 |
| 買いシグナル | `DailySummary.buySignals` 相当（件数） |
| 売りシグナル | `DailySummary.sellSignals` 相当（件数） |
| AI 判定 | `DailySummary.aiAnalysis.summary` 相当 |
| 更新時間 | `DailySummary.updatedAt` 相当 |
| サポートレベル | `DailySummary.supportLevel` 相当（任意項目） |
| レジスタンスレベル | `DailySummary.resistanceLevel` 相当（任意項目） |

**詳細ダイアログの流用**:
- SCR-004 で使用しているサマリー詳細ダイアログコンポーネントを、トップ画面でも import して使用する
- ダイアログへ渡すデータは、トップ画面でティッカー選択時に取得済みのサマリーデータを使用する

---

### 4. トップ画面 保有株式パネル CRUD 追加（web）

**流用コンポーネントの方針**:
- SCR-002（保有株式管理画面）で使用している作成・編集・削除ダイアログコンポーネントを import して使用する
- コンポーネントに渡す `defaultExchange`・`defaultTicker` プロパティとして、現在トップ画面で選択中の取引所・ティッカーを渡す（存在する場合）

**状態管理の方針**:
- CRUD 操作完了後、保有株式パネルのデータを再取得して表示を更新する（既存の取得ロジックを再利用）

---

### 5. トップ画面 アラートパネル CRUD 追加（web）

**流用コンポーネントの方針**:
- SCR-003（アラート一覧画面）で使用している作成・編集・削除ダイアログコンポーネントを import して使用する
- コンポーネントに渡す `defaultExchange`・`defaultTicker` プロパティとして、現在トップ画面で選択中の取引所・ティッカーを渡す（存在する場合）

**状態管理の方針**:
- CRUD 操作完了後、アラートパネルのデータを再取得して表示を更新する（既存の取得ロジックを再利用）
- アラートのオーバーレイライン（チャート上の上限・下限ライン）も同時に更新する

---

### 6. サマリー詳細ダイアログ モバイル横幅修正（web）

**修正対象の特定方針**:
- モバイル幅でダイアログを表示し、`overflow: hidden` が欠落している要素を特定する
- MUI Dialog コンポーネントの `PaperProps` や `sx` prop でモバイル幅のスタイルを調整する

**修正内容**:
- ダイアログコンテナ: `maxWidth: '100vw'`、`overflow: hidden` を設定
- ダイアログ内のテーブル・横長コンテンツ: `overflow-x: auto` でスクロール可能にする
- 長文テキスト: `wordBreak: 'break-word'` で折り返す
- ダイアログの `fullWidth` プロパティと `maxWidth` プロパティを適切に設定する

---

## 実装上の注意点

### 依存関係・前提条件

- `AlertRepository.delete` インターフェースは既存のため変更不要
- ダイアログコンポーネントの流用は、コンポーネントの現状の props インターフェースを確認してから行う
- OpenAI Responses API の `tool_choice` オプションは使用している SDK バージョンが対応していることを確認する

### セキュリティ考慮事項

- トップ画面に追加する CRUD 操作は、既存の保有株式・アラート API Routes と同じ認可チェックを経由する（ユーザー所有リソースのみ操作可能）
- ダイアログコンポーネント流用時に認可ロジックが変わらないことを確認する

### パフォーマンス考慮事項

- AI 解析で `tool_choice: 'required'` を設定すると Web 検索が必ず実行されるため、バッチ処理の所要時間が増加する可能性がある
- トップ画面での CRUD 操作後のデータ再取得は最小限のスコープ（変更対象パネルのデータのみ）に留める

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `docs/services/stock-tracker/requirements.md` に統合すること：
    - UC-010 の「無効化」を「削除」に変更
    - UC-009 のサマリーパネル表示項目の変更内容を反映
    - UC-002・UC-003 にトップ画面からの CRUD 操作を追加
    - UC-006 に Web 検索必須化の変更内容を反映
    - F-017（チャート画面統合表示）の機能説明を更新（CRUD 追加）
    - F-018（一時アラート失効バッチ）の機能説明を更新（削除に変更）
- [ ] `docs/services/stock-tracker/external-design.md` に統合すること：
    - SCR-001 の日次サマリーパネル・保有株式パネル・アラートパネルの UI 変更を反映
    - SCR-004 のモバイル対応修正を ADR または注記として記録
- [ ] `docs/services/stock-tracker/architecture.md` に ADR として追記すること（重要な設計決定があれば）：
    - ダイアログコンポーネントをトップ画面に流用した設計判断の記録
