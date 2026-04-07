# 週次ドキュメントレビュー 2026年第14週 - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/ に反映し、
    tasks/issue-2610-docs-review-2026-w14/ ディレクトリごと削除します。

    入力: tasks/issue-2610-docs-review-2026-w14/requirements.md
    次に作成するドキュメント: tasks/issue-2610-docs-review-2026-w14/tasks.md
-->

## 修正対象ファイル一覧

調査完了。以下の修正が必要と判明した。

| ファイル | 修正内容 | 優先度 |
|---------|---------|--------|
| `.github/copilot-instructions.md` | サービス一覧を実態の8サービスに更新 | 高（P2-2） |
| `docs/services/codec-converter/testing.md` | デバイス記述をワークフロー実態（chromium-mobile を含む）に合わせて修正 | 中（T006） |
| `docs/development/monorepo-structure.md` | libs/* のカバレッジ目標「推奨」→「必須」に修正 | 中（T007） |

---

## Priority 1: 二重管理の整合性

### P1-1: Copilot Instructions ⇄ rules.md

**調査観点**:

- MUST/SHOULD/MAY/MUST NOT ルールの一致
- テストカバレッジ 80% が両方に記載されているか
- エラーメッセージ日本語 + 定数化が一致しているか
- ライブラリ依存の一方向性 (`ui → browser → common`) が一致しているか
- パスエイリアス禁止ルール（ライブラリ内）が一致しているか
- `dangerouslySetInnerHTML` 禁止ルールが一致しているか

**調査結果**: ✅ **問題なし**

- `copilot-instructions.md` の `### 特に重要なルール` 7項目は rules.md のルールと完全に一致している
    - TypeScript strict mode → `#### MUST: strict mode 必須`（rules.md L24）
    - テストカバレッジ 80% → `#### MUST: ビジネスロジックのカバレッジ 80% 以上を確保`（rules.md L530）
    - エラーメッセージ日本語+定数化 → `#### MUST: エラーメッセージは定数オブジェクトで管理`（rules.md L391）
    - UI/ビジネスロジック分離 → `#### MUST: UI層 (components/, app/) とビジネスロジック (lib/) を明確に分離`（rules.md L313）
    - ライブラリ依存一方向性 → `#### MUST: ライブラリ間の依存を一方向に保つ`（rules.md L1334）
    - パスエイリアス禁止 → `#### MUST NOT: ライブラリでパスエイリアス (paths) を使用しない`（rules.md L131）
    - dangerouslySetInnerHTML 禁止 → `#### MUST NOT: dangerouslySetInnerHTML を使用しない`（rules.md L1038）

### P1-2: Jest coverageThreshold ⇄ testing.md

**調査観点**:

- すべての `jest.config.ts` で `coverageThreshold` が 80% に設定されているか
- `docs/development/testing.md` の「ビジネスロジック: 80%以上」記述と一致しているか
- 例外（`niconico-mylist-assistant/batch`）が文書化されているか

**既知の事実**:

- `services/niconico-mylist-assistant/batch/jest.config.ts` は `coverageThreshold` 未設定
- 理由: `src/playwright-automation.ts` が Playwright のブラウザプロセス起動に直接依存しているため
- `docs/development/testing.md` に例外として文書化済み → **対応不要**

**調査結果**: ✅ **問題なし**（例外は文書化済み）

- 全 jest.config.ts の `coverageThreshold` が 80% に設定されていることを確認済み
- `services/niconico-mylist-assistant/batch` の例外は `docs/development/testing.md` に文書化済み

### P1-3: Issue Template ⇄ rules.md

**調査観点**:

- `.github/ISSUE_TEMPLATE/bug.yml`, `feature.yml`, `refactor.yml` のチェックリスト項目が rules.md の MUST ルールをカバーしているか
- 「テストカバレッジ80%以上」がチェック項目に含まれているか

**調査結果**: ⚠️ **軽微な差異あり（対応は任意）**

- `bug.yml`: 「テストカバレッジ80%以上」の明示的なチェック項目が**ない**
    - チェックリストには「修正内容のテストを追加した」のみ
    - バグ修正でも既存テストのカバレッジ維持は MUST だが、明示されていない
- `feature.yml`: ✅「テストカバレッジ80%以上を確保した」あり
- `refactor.yml`: ✅「テストカバレッジ80%以上を確保した」あり
- **判断**: bug.yml にカバレッジ記載がないことは軽微な差異。PR Template でカバーされており、対応は任意とする。

### P1-4: PR Template ⇄ development ドキュメント

**調査観点**:

- `.github/pull_request_template.md` のチェックリストが最新のルールを反映しているか
- 「テストカバレッジ80%以上」が記載されているか
- 「関連ドキュメントを更新した」チェック項目が存在するか

**調査結果**: ✅ **問題なし**

- 「テストを追加・更新した（テストカバレッジ80%以上を確保）」✅ あり
- 「関連ドキュメントを更新した」✅ あり
- コーディング規約、アーキテクチャガイドライン、開発方針への参照リンク ✅ あり

---

## Priority 2: 構造的整合性

### P2-1: Branch Strategy の整合性

**調査観点**:

- ブランチフロー (`feature → integration → develop → master`) が `docs/branching.md` と `copilot-instructions.md` で一致しているか
- Fast CI / Full CI の記述が一致しているか

**調査結果**: ✅ **問題なし**

- ブランチフロー: `docs/branching.md` は `feature/AppA → integration/AppA → develop → master`、`copilot-instructions.md` は `feature/** → integration/** → develop → master` で表現が若干異なるが意味は同一
- Fast CI: `integration/**` へのPR → ビルド、品質チェック、テスト、E2E（chromium-mobile のみ） → 両方一致 ✅
- Full CI: `develop` へのPR → カバレッジチェック（80%）+ E2E（全デバイス） → 両方一致 ✅

### P2-2: Monorepo Structure の整合性（要修正）

**問題**:

`.github/copilot-instructions.md` の `### モノレポ構成` セクションに記載されているサービス一覧が古い。

- **現在の記載**: `stock-tracker`, `niconico-mylist-assistant`, `share-together` の3サービスのみ
- **実際のサービス**: `admin`, `auth`, `codec-converter`, `niconico-mylist-assistant`, `quick-clip`, `share-together`, `stock-tracker`, `tools` の8サービス

**修正方針**:

`copilot-instructions.md` の `services/` のサービス一覧を実態に合わせて更新する。
各サービスの説明は `docs/development/monorepo-structure.md` や各サービスの docs を参照して記載する。

**修正後のサービス一覧（案）**:

```
services/          # アプリケーション
├── admin/                    # 管理画面
├── auth/                     # 認証サービス
├── codec-converter/          # コーデック変換サービス
├── niconico-mylist-assistant/ # ニコニコマイリスト管理
├── quick-clip/               # クイッククリップ
├── share-together/           # みんなでシェアリスト
├── stock-tracker/            # 株価トラッカー
└── tools/                    # ツール集
```

### P2-3: Test Device Configuration の整合性

**調査観点**:

- Fast CI のデバイス (`chromium-mobile`) が `copilot-instructions.md`、`docs/development/testing.md`、ワークフローファイルの3箇所で一致しているか
- Full CI のデバイス (`chromium-desktop`, `chromium-mobile`, `webkit-mobile`) が一致しているか

**調査結果**: ⚠️ **codec-converter の docs が実態と不一致**

- 標準サービスのデバイス設定: ✅ 3箇所（copilot-instructions.md / testing.md / ワークフロー）で一致
    - Fast CI: `chromium-mobile` のみ
    - Full CI: `chromium-desktop` + `chromium-mobile` + `webkit-mobile`
- **問題**: `docs/services/codec-converter/testing.md` はモバイルデバイスをテスト対象外と記述しているが、`codec-converter-verify.yml` は `chromium-mobile`（常時）と `webkit-mobile`（develop PR のみ）も実行している
    - ドキュメントの記述: 「PC環境のみを対象」「モバイルデバイスはテスト対象外」「chromium-desktop のみ」
    - 実際のワークフロー: Fast CI では `chromium-mobile` が常時実行、Full CI では `chromium-desktop` + `chromium-mobile` + `webkit-mobile`
    - **対応**: `docs/services/codec-converter/testing.md` のデバイス記述を実態に合わせて修正する

---

## Priority 3: ドキュメント間の整合性

### P3-1: テストカバレッジ 80% の記載一貫性

**対象ファイル（12ファイル）**:

- `docs/agents/task.proposal.README.md`
- `docs/branching.md`
- `docs/development/architecture.md`
- `docs/development/monorepo-structure.md`
- `docs/development/rules.md`
- `docs/development/service-template.md`
- `docs/development/testing.md`
- `docs/development/validation.md`
- `docs/infra/root/architecture.md`
- `docs/libs/aws/README.md`
- `docs/libs/browser/README.md`
- `docs/libs/common/README.md` 他

**調査結果**: ⚠️ **1箇所に矛盾あり**

- `docs/development/rules.md` L544: 「共通ライブラリ（`libs/*`）も 80% 以上**必須**」 ← MUST として定義
- `docs/development/monorepo-structure.md` L465: 「共通ライブラリ（libs/*）カバレッジ目標: 80%以上**推奨**」 ← 矛盾
- 実際の jest.config.ts: 全 libs/* で `coverageThreshold: 80%` が設定済み → **必須が正しい**
- **対応**: `monorepo-structure.md` の「推奨」を「必須」に修正する
- その他の箇所（branching.md、architecture.md、testing.md、services/* 等）は全て一貫して「80%以上必須」と記載されており問題なし
- `docs/agents/task.proposal.README.md` の「テストカバレッジ100%」はコードサンプルのヒント記述であり、libs/* の一般ルールとは異なる文脈（問題なし）

### P3-2: ライブラリ依存方向の記載一貫性

**対象**: 16ファイル（`docs/` および `.github/` 内のすべての参照）

**確認済み事項**:

- `docs/development/shared-libraries.md`, `docs/development/rules.md`, `.github/copilot-instructions.md`, `docs/agents/task.proposal.README.md` で確認済み → 一致

**調査結果**: ✅ **問題なし**

- 確認した全ファイルで `ui → browser → common` で統一されている
- `docs/development/shared-libraries.md`: `ui → browser → common` ✅
- `docs/development/rules.md`: `MUST: ライブラリ間の依存を一方向に保つ (ui → browser → common)` ✅
- `docs/agents/task.proposal.README.md`: `ui → browser → common`（循環禁止）✅
- `.github/copilot-instructions.md`: 3箇所に記載、全て一致 ✅
- `docs/development/monorepo-structure.md`: `libs/react → libs/common`, `libs/nextjs → libs/common`, `aws は独立` も一致 ✅

### P3-3: MUST/SHOULD ルールの重複と矛盾

**調査結果**: ⚠️ **意図的な重複あり（許容範囲）**

- `docs/development/architecture.md` に `MUST` ルールが重複記載されている（例: エラーメッセージ日本語化、カバレッジ 80%）
- ただし、`architecture.md` の末尾に `docs/development/rules.md` への参照リンクはあり（L939）
- architecture.md のルール記述は「サービスアーキテクチャの文脈での説明」として意図的な重複と判断できる
- rules.md が Single Source of Truth として機能しているが、重複記述が意図的であるため修正は不要

### P3-4: ドキュメント間のリンク切れ

Issue 作成時の自動チェックで **問題なし** と報告済み。対応不要。

### P3-5: ドキュメント間の重複記述

**調査結果**: ⚠️ **意図的な重複あり（許容範囲）**

- テスト戦略（デバイス設定、カバレッジ目標）が `testing.md`、`copilot-instructions.md`、各サービス `testing.md` に重複記載されている
- これはサービスドキュメントが単体で理解可能であるための意図的な重複と判断できる（最小限のルール原則に基づく許容範囲）

---

## Priority 4: 実装との乖離

### P4-1: 実装との乖離チェック

**調査観点**:

- `rules.md` の MUST ルールが実際のコードで守られているかサンプリング確認
- `architecture.md` の図が最新の構成を反映しているか

**調査結果**: ✅ **問題なし（サンプリング範囲）**

PR #2596 の変更（`libs/common/src/push/config.ts` 追加、サービスの VAPID 処理共通化）は rules.md の「共通ライブラリに実装があれば優先的に使用」MUST ルールに沿った変更であり、乖離は確認されなかった。

### P4-2: 方針変更の追従漏れチェック

**検出されたコミット**: `bc6f927` (Merge pull request #2596 from nagiyu/integration/2441-refactoring-2026-03-27)

**調査結果**: ✅ **問題なし**

PR #2596 で変更されたファイルは `docs/development/shared-libraries.md` のみ（ドキュメント側）。追加内容:
1. `User` 型定義の統一を文書化
2. `getVapidConfig()` を文書化
3. `sendWebPushNotification` の `VapidConfig` 渡し方を更新

これらはライブラリ実装の方針変更ではなく「既存の共通化を文書化」したものであり、rules.md や copilot-instructions.md への追記は不要。

---

## 実装上の注意点

### 修正の原則

- **最小限の変更**: 必要な箇所のみ修正し、不要な書き換えは行わない
- **整合性の維持**: 修正後は関連ドキュメントとの整合性を確認する
- **実装コードは変更しない**: 本タスクはドキュメント修正のみ

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `.github/copilot-instructions.md` の修正後、内容が `docs/development/monorepo-structure.md` と整合していることを確認すること
- [ ] 調査で新たに発見した問題があれば、該当する `docs/` ファイルを更新すること
- [ ] `tasks/issue-2610-docs-review-2026-w14/` ディレクトリを削除すること
