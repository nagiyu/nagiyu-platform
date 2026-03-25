# Issue #2342 週次ドキュメントレビュー対応 - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-2342-docs-review/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-2342-docs-review/requirements.md — 受け入れ条件・ユースケース
    - tasks/issue-2342-docs-review/design.md — 修正方針・スクリプト設計
-->

## Phase 1: リンク切れチェックスクリプトの作成

- [ ] T001: `.github/workflows/scripts/` ディレクトリを作成する（依存: なし）
- [ ] T002: `.github/workflows/scripts/check-doc-links.py` を新規作成する（依存: T001）
    - `docs/` 配下の全 `.md` ファイルを再帰列挙する処理を実装する
    - 各ファイルから `[テキスト](パス.md)` 形式のリンクを抽出する正規表現を実装する
    - 抽出したリンクパスをリンク記述元ファイルの位置を基準に解決する処理を実装する
    - 解決後のパスが実在しない場合のみ「❌ リンク切れ」として出力する処理を実装する
    - 最後に検出件数のサマリーを表示する（0 件の場合は「✅ リンク切れなし」）

## Phase 2: スクリプトの動作検証

- [ ] T003: 修正スクリプトをローカルで実行して false positive が 0 件であることを確認する（依存: T002）
    - 実行コマンド: `python3 .github/workflows/scripts/check-doc-links.py`
    - 期待結果: 「✅ リンク切れなし」または実際に存在するリンク切れのみが出力される
- [ ] T004: 旧ワンライナーを実行して 70 件以上の false positive が再現することを手元で確認し、修正後との差分を記録する（依存: T002）

## Phase 3: weekly-review-body.md の更新

- [ ] T005: `.github/workflows/templates/weekly-review-body.md` の「確認コマンド」セクションを更新する（依存: T003）
    - 「ドキュメント間のリンク切れチェック」セクション（行 143–144 付近）の誤ったワンライナーを削除する
    - 代替コマンド `python3 .github/workflows/scripts/check-doc-links.py` を掲載する

## Phase 4: testing.md のカバレッジ例外の明記

- [ ] T006: `docs/development/testing.md` に niconico-mylist-assistant/batch のカバレッジ例外を追記する（依存: なし、Phase 1-3 と並列実行可能）
    - 追記箇所: カバレッジ閾値に関するセクション（行 222 付近）
    - 追記内容:
        - niconico-mylist-assistant/batch のみ `coverageThreshold` が未設定である旨
        - 理由: `src/playwright-automation.ts`（コアロジック）が Playwright に直接依存しており、Jest 単体テストでのモック化が困難な構造のため
        - 補足: これはバッチパッケージ全般のルールではなく、本パッケージ固有の構造的例外（他バッチパッケージは通常どおり 80% 閾値を設定する）
        - 将来方針: Playwright 依存コードと純粋ロジックを分離してテスタビリティを改善することを別タスクで検討する

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
    - [ ] UC-001: 修正スクリプト実行で false positive が 0 件
    - [ ] UC-002: `testing.md` に niconico-mylist-assistant/batch のカバレッジ未設定理由（Playwright 依存構造）が明記されている
- [ ] 修正スクリプト（`check-doc-links.py`）がリポジトリルートから実行できる
- [ ] `weekly-review-body.md` の確認コマンドが修正スクリプト呼び出しに更新されている
- [ ] `docs/development/testing.md` に niconico-mylist-assistant/batch のカバレッジ例外（Playwright 依存構造）の記述が追記されている
- [ ] Lint・型チェックは対象外（Python スクリプト・Markdown のみの変更）
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `tasks/issue-2342-docs-review/` ディレクトリを削除した
