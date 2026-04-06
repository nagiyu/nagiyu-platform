# 週次ドキュメントレビュー 2026年第14週 - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-2610-docs-review-2026-w14/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-2610-docs-review-2026-w14/requirements.md — 受け入れ条件・スコープ
    - tasks/issue-2610-docs-review-2026-w14/design.md — 調査観点・修正方針
-->

## Phase 1: Priority 1 — 二重管理の整合性チェック

<!-- 各二重管理の項目を調査し、不整合があれば修正する -->

- [ ] T001: Copilot Instructions と `docs/development/rules.md` の MUST/SHOULD ルールを照合し、不整合があれば修正する
    - 確認箇所: `.github/copilot-instructions.md` → `### 特に重要なルール` セクション
    - 確認箇所: `docs/development/rules.md` → 各 MUST/MUST NOT ルール
- [ ] T002: Issue Template と `docs/development/rules.md` の整合性を確認し、不整合があれば修正する
    - 確認箇所: `.github/ISSUE_TEMPLATE/bug.yml`, `feature.yml`, `refactor.yml` のチェックリスト
    - 確認観点: 「テストカバレッジ80%以上」の記載が含まれているか
- [ ] T003: PR Template と development ドキュメントの整合性を確認し、不整合があれば修正する
    - 確認箇所: `.github/pull_request_template.md`
    - 確認観点: 最新の MUST ルールがチェックリストに反映されているか、「関連ドキュメントを更新した」チェック項目が存在するか

## Phase 2: Priority 2 — 構造的整合性チェック・修正

<!-- 構造的な不整合を確認し、確認済みの問題を修正する -->

- [ ] T004: `.github/copilot-instructions.md` のサービス一覧を実態に合わせて更新する
    - **修正内容**: `### モノレポ構成` の `services/` セクションを下記8サービスに更新する
        - `admin/` — プラットフォーム管理画面（core + web）
        - `auth/` — 認証サービス（core + web）
        - `codec-converter/` — コーデック変換サービス（core + web + batch）
        - `niconico-mylist-assistant/` — ニコニコマイリスト管理（core + web + batch）
        - `quick-clip/` — さくっとクリップ（core + web + batch + lambda）
        - `share-together/` — みんなでシェアリスト（core + web）
        - `stock-tracker/` — 株価トラッカー（core + web + batch）
        - `tools/` — ツール集
- [ ] T005: Branch Strategy の整合性を確認する
    - 確認箇所: `docs/branching.md` と `.github/copilot-instructions.md` のブランチフロー記述
    - 確認観点: `feature → integration → develop → master` の記述と Fast CI / Full CI の記述が一致しているか
- [ ] T006: Test Device Configuration の整合性を確認する
    - 確認箇所: `.github/copilot-instructions.md`、`docs/development/testing.md`、各ワークフローファイル
    - 確認観点: Fast CI のデバイス (`chromium-mobile`) と Full CI のデバイス一覧が3箇所で一致しているか

## Phase 3: Priority 3 — ドキュメント間の整合性チェック

<!-- 複数のドキュメントにわたる一貫性を確認する -->

- [ ] T007: テストカバレッジ 80% の記載一貫性を確認する（12ファイル対象）
    - 対象: `docs/agents/task.proposal.README.md`, `docs/branching.md`, `docs/development/architecture.md`, `docs/development/monorepo-structure.md`, `docs/development/rules.md`, `docs/development/service-template.md`, `docs/development/testing.md`, `docs/development/validation.md`, `docs/infra/root/architecture.md`, `docs/libs/aws/README.md`, `docs/libs/browser/README.md`, `docs/libs/common/README.md` 他
    - 確認観点: 「80%」の適用範囲（branches/functions/lines/statements）が一致しているか、例外ケースが明確に区別されているか
- [ ] T008: ライブラリ依存方向 (`ui → browser → common`) の記載一貫性を確認する（16ファイル対象）
    - 確認済み範囲は問題なし。未確認ファイルを追加で確認する
- [ ] T009: MUST/SHOULD ルールの重複と矛盾をチェックする
    - `docs/development/rules.md` が Single Source of Truth になっているか確認する
    - 他のドキュメントが rules.md を参照リンクで指しているか確認する
- [ ] T010: ドキュメント間の重複記述を確認し、不要な重複があれば参照リンクに統一する

## Phase 4: Priority 4 — 実装との乖離チェック（任意）

<!-- 優先度が低いため、上記フェーズ完了後に余力があれば実施する -->

- [ ] T011: PR #2596 (commit `bc6f927`) の変更内容を確認し、ドキュメントへの反映漏れがないか確認する
    - 確認観点: MUST ルール変更、テストカバレッジ基準変更、ライブラリ構成変更の有無
- [ ] T012: `docs/development/rules.md` の MUST ルールが実際のコードで守られているかサンプリング確認する（任意）

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
- [ ] Lint・型チェックがすべて通過している（ドキュメントのみのため Markdown フォーマット確認）
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] 調査で発見した問題を該当する `docs/` ファイルに反映した
- [ ] `.github/copilot-instructions.md` のサービス一覧が実態と一致している
- [ ] `tasks/issue-2610-docs-review-2026-w14/` ディレクトリを削除した
