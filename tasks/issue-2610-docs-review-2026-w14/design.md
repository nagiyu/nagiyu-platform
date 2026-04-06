# 週次ドキュメントレビュー 2026年第14週 - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/ に反映し、
    tasks/issue-2610-docs-review-2026-w14/ ディレクトリごと削除します。

    入力: tasks/issue-2610-docs-review-2026-w14/requirements.md
    次に作成するドキュメント: tasks/issue-2610-docs-review-2026-w14/tasks.md
-->

## 修正対象ファイル一覧

| ファイル | 修正内容 | 優先度 |
|---------|---------|--------|
| `.github/copilot-instructions.md` | サービス一覧を実態の8サービスに更新 | 高（P2-2） |
| 各調査後に追記 | 調査結果に応じて対応方針を決定する | - |

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

**調査結果**: 実装時に記入する

### P1-2: Jest coverageThreshold ⇄ testing.md

**調査観点**:

- すべての `jest.config.ts` で `coverageThreshold` が 80% に設定されているか
- `docs/development/testing.md` の「ビジネスロジック: 80%以上」記述と一致しているか
- 例外（`niconico-mylist-assistant/batch`）が文書化されているか

**既知の事実**:

- `services/niconico-mylist-assistant/batch/jest.config.ts` は `coverageThreshold` 未設定
- 理由: `src/playwright-automation.ts` が Playwright のブラウザプロセス起動に直接依存しているため
- `docs/development/testing.md` に例外として文書化済み → **対応不要**

**調査結果**: 追加調査不要（例外は文書化済み）

### P1-3: Issue Template ⇄ rules.md

**調査観点**:

- `.github/ISSUE_TEMPLATE/bug.yml`, `feature.yml`, `refactor.yml` のチェックリスト項目が rules.md の MUST ルールをカバーしているか
- 「テストカバレッジ80%以上」がチェック項目に含まれているか

**調査結果**: 実装時に記入する

### P1-4: PR Template ⇄ development ドキュメント

**調査観点**:

- `.github/pull_request_template.md` のチェックリストが最新のルールを反映しているか
- 「テストカバレッジ80%以上」が記載されているか
- 「関連ドキュメントを更新した」チェック項目が存在するか

**調査結果**: 実装時に記入する

---

## Priority 2: 構造的整合性

### P2-1: Branch Strategy の整合性

**調査観点**:

- ブランチフロー (`feature → integration → develop → master`) が `docs/branching.md` と `copilot-instructions.md` で一致しているか
- Fast CI / Full CI の記述が一致しているか

**調査結果**: 実装時に記入する

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

**調査結果**: 実装時に記入する

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

**調査結果**: 実装時に記入する

### P3-2: ライブラリ依存方向の記載一貫性

**対象**: 16ファイル（`docs/` および `.github/` 内のすべての参照）

**確認済み事項**:

- `docs/development/shared-libraries.md`, `docs/development/rules.md`, `.github/copilot-instructions.md`, `docs/agents/task.proposal.README.md` で確認済み → 一致

**調査結果**: 追加調査で問題なければ対応不要

### P3-3: MUST/SHOULD ルールの重複と矛盾

- `docs/development/rules.md` が Single Source of Truth であるか
- 他のドキュメントが rules.md を参照リンクで指しているか確認

**調査結果**: 実装時に記入する

### P3-4: ドキュメント間のリンク切れ

Issue 作成時の自動チェックで **問題なし** と報告済み。対応不要。

### P3-5: ドキュメント間の重複記述

**調査結果**: 実装時に記入する

---

## Priority 4: 実装との乖離

### P4-1: 実装との乖離チェック

**調査観点**:

- `rules.md` の MUST ルールが実際のコードで守られているかサンプリング確認
- `architecture.md` の図が最新の構成を反映しているか

**調査結果**: 実装時に記入する

### P4-2: 方針変更の追従漏れチェック

**検出されたコミット**: `bc6f927` (Merge pull request #2596 from nagiyu/integration/2441-refactoring-2026-03-27)

**調査観点**:

- PR #2596 で方針変更があったか確認する
- 変更があった場合、ドキュメントへの反映漏れがないか確認する

**調査結果**: 実装時に記入する

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
