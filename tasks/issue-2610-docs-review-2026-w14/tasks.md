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

- [x] T001: Copilot Instructions と `docs/development/rules.md` の MUST/SHOULD ルールを照合し、不整合があれば修正する
    - **結果**: ✅ 問題なし。7 MUST/MUST NOT ルールは完全一致。修正不要。
- [x] T002: Issue Template と `docs/development/rules.md` の整合性を確認し、不整合があれば修正する
    - **結果**: ⚠️ `bug.yml` にテストカバレッジ80%以上の明示的な項目がないが、PR Template でカバーされているため対応は任意。
- [x] T003: PR Template と development ドキュメントの整合性を確認し、不整合があれば修正する
    - **結果**: ✅ 問題なし。「テストカバレッジ80%以上」「関連ドキュメントを更新した」ともに記載あり。修正不要。

## Phase 2: Priority 2 — 構造的整合性チェック・修正

<!-- 構造的な不整合を確認し、確認済みの問題を修正する -->

- [ ] T004: `.github/copilot-instructions.md` のサービス一覧を実態に合わせて更新する
    - **状態**: 🔴 要修正。8サービスに更新必要。
- [x] T005: Branch Strategy の整合性を確認する
    - **結果**: ✅ 問題なし。`docs/branching.md` と `copilot-instructions.md` で一致。修正不要。
- [x] T006: Test Device Configuration の整合性を確認する
    - **結果**: ⚠️ 標準サービスは問題なし。但し `docs/services/codec-converter/testing.md` のデバイス記述が `codec-converter-verify.yml` の実態と不一致。
        - ドキュメント: 「PC環境のみ（chromium-desktop）」「モバイルデバイスはテスト対象外」
        - 実際のワークフロー: Fast CI で `chromium-mobile` が常時実行される
        - → `docs/services/codec-converter/testing.md` の修正が必要。

## Phase 3: Priority 3 — ドキュメント間の整合性チェック

<!-- 複数のドキュメントにわたる一貫性を確認する -->

- [x] T007: テストカバレッジ 80% の記載一貫性を確認する（12ファイル対象）
    - **結果**: ⚠️ `docs/development/monorepo-structure.md` の共通ライブラリのカバレッジ目標が「**推奨**」と記載されているが、rules.md では「**必須**」（かつ実際の jest.config.ts でも 80% 閾値が設定済み）。修正が必要。
- [x] T008: ライブラリ依存方向 (`ui → browser → common`) の記載一貫性を確認する（16ファイル対象）
    - **結果**: ✅ 問題なし。全確認ファイルで一致。修正不要。
- [x] T009: MUST/SHOULD ルールの重複と矛盾をチェックする
    - **結果**: ⚠️ `docs/development/architecture.md` に MUST ルールの重複記述あり。ただし末尾に rules.md への参照リンクがあり、アーキテクチャ文脈での意図的な重複と判断。修正不要。
- [x] T010: ドキュメント間の重複記述を確認し、不要な重複があれば参照リンクに統一する
    - **結果**: ⚠️ テスト戦略が複数ファイルに重複しているが、サービスドキュメントの自己完結性のための意図的な重複と判断。修正不要。

## Phase 4: Priority 4 — 実装との乖離チェック（任意）

<!-- 優先度が低いため、上記フェーズ完了後に余力があれば実施する -->

- [x] T011: PR #2596 (commit `bc6f927`) の変更内容を確認し、ドキュメントへの反映漏れがないか確認する
    - **結果**: ✅ 問題なし。変更は `shared-libraries.md` に適切に反映済み（`getVapidConfig()`, `User` 型定義の統一、VAPID 送信方法の更新）。
- [x] T012: `docs/development/rules.md` の MUST ルールが実際のコードで守られているかサンプリング確認する（任意）
    - **結果**: ✅ 問題なし（サンプリング範囲）。PR #2596 は共通化を進めた変更であり rules.md のルールに沿っている。

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
- [ ] Lint・型チェックがすべて通過している（ドキュメントのみのため Markdown フォーマット確認）
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] 調査で発見した問題（T004, T006, T007）を該当する `docs/` / `.github/` ファイルに反映した
- [ ] `.github/copilot-instructions.md` のサービス一覧が実態と一致している
- [ ] `docs/services/codec-converter/testing.md` のデバイス記述がワークフロー実態と一致している
- [ ] `docs/development/monorepo-structure.md` の libs/* カバレッジ目標が「必須」になっている
- [ ] `tasks/issue-2610-docs-review-2026-w14/` ディレクトリを削除した

---

## 調査結果サマリー

| タスク | 結果 | 対応要否 |
|--------|------|---------|
| T001: Copilot Instructions ⇄ rules.md | ✅ 問題なし | 不要 |
| T002: Issue Template ⇄ rules.md | ⚠️ bug.yml にカバレッジ未記載 | 任意 |
| T003: PR Template ⇄ docs | ✅ 問題なし | 不要 |
| T004: Copilot Instructions サービス一覧 | 🔴 要修正 | **必要** |
| T005: Branch Strategy | ✅ 問題なし | 不要 |
| T006: Test Device Configuration | 🔴 codec-converter testing.md が実態と不一致 | **必要** |
| T007: カバレッジ 80% 一貫性 | 🔴 monorepo-structure.md が「推奨」と誤記 | **必要** |
| T008: ライブラリ依存方向 | ✅ 問題なし | 不要 |
| T009: MUST/SHOULD 重複 | ⚠️ 意図的な重複 | 不要 |
| T010: 重複記述 | ⚠️ 意図的な重複 | 不要 |
| T011: PR #2596 反映漏れ | ✅ 問題なし | 不要 |
| T012: 実装との乖離 | ✅ 問題なし | 不要 |
