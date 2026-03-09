# 2026年第10週 週次ドキュメントレビュー

## 概要

週次ドキュメントレビューとして、ドキュメント間の構造的な問題・二重管理の不整合を検出・修正する。
過去1週間で103ファイルが更新されており、方針ドキュメントの整合性チェックが必要。

## 関連情報

- Issue: #1634
- 前回レビュー Issue: #1633
- タスクタイプ: プラットフォームタスク
- 対象期間: 2026-03-02 〜 2026-03-09

## 要件

### 機能要件

- FR1: Priority 1（必須）のチェックリストを全項目完了させる
- FR2: Priority 2（推奨）のチェックリストを全項目確認する
- FR3: Priority 3（推奨）のチェックリストを全項目確認する
- FR4: Priority 4（任意）のチェックリストを確認する（方針変更の追従漏れは必須）
- FR5: 発見した問題をIssueのコメントに記録する
- FR6: 修正が必要な問題はPRを作成して修正する
- FR7: レビュー完了後にIssueをクローズする

### 非機能要件

- NFR1: ドキュメント修正のみで、実装コードへの変更は最小限に留める
- NFR2: 修正は一意性・一貫性を保ちながら行う
- NFR3: Markdownは4スペースインデント（`.vscode/settings.json`準拠）

## チェック対象と方針

### Priority 1: 二重管理の整合性（必須）

#### 1. Copilot Instructions ⇄ rules.md の整合性

確認観点:
- `.github/copilot-instructions.md` に記載のルールが `docs/development/rules.md` と矛盾していないか
- 主要ルール（strict mode、カバレッジ80%、`dangerouslySetInnerHTML`禁止、パスエイリアス禁止等）が両ファイルで一致しているか
- Copilot側に追加・削除されたルールがrules.mdに反映されているか（あるいはその逆）

#### 2. Jest Coverage Threshold ⇄ testing.md の整合性

確認観点:
- 各 `jest.config.ts` の `coverageThreshold`（branches/functions/lines/statements: 80）が `docs/development/testing.md` の記載と一致しているか
- 新規サービス・ライブラリのjest.config.tsにカバレッジ設定が含まれているか

#### 3. Issue Template ⇄ rules.md の整合性

確認観点:
- `.github/ISSUE_TEMPLATE/` 内の各テンプレート（bug.yml, feature.yml, refactor.yml）のチェックリストが `docs/development/rules.md` と整合しているか
- 新たにrules.mdに追加されたルールがテンプレートのチェックリストに反映されているか

#### 4. PR Template ⇄ development ドキュメントの整合性

確認観点:
- `.github/pull_request_template.md` の実装チェックリストが `docs/development/rules.md`, `docs/development/testing.md`, `docs/development/architecture.md` と整合しているか
- 実装前チェックリストが参照しているドキュメントの現在のパスが正しいか

### Priority 2: 構造的整合性（推奨）

#### 5. Branch Strategy の整合性

確認観点:
- `docs/branching.md` のブランチフロー（feature → integration → develop → master）が `docs/development/testing.md` のCI戦略と一致しているか
- 各CIワークフローファイル（`.github/workflows/`）のトリガー設定とドキュメントの記述が一致しているか

#### 6. Monorepo Structure の整合性

確認観点:
- `docs/development/monorepo-structure.md`（あれば）と `docs/development/shared-libraries.md` のパッケージ一覧・依存関係が一致しているか
- `docs/README.md` に記載のモノレポ構成と実際の `libs/`, `services/` ディレクトリ構成が一致しているか

#### 7. Test Device Configuration の整合性

確認観点:
- Playwright設定ファイル（`playwright.config.ts`）のデバイス定義（chromium-mobile, chromium-desktop, webkit-mobile）が `docs/development/testing.md` の記載と一致しているか
- Fast CI（chromium-mobile のみ）と Full CI（全3デバイス）のワークフロー設定がドキュメントと一致しているか

### Priority 3: ドキュメント間の整合性（推奨）

#### 8. テストカバレッジ 80% の記載一貫性

確認ファイル（12ファイル）:
- `docs/development/testing.md`
- `docs/development/rules.md`
- `.github/copilot-instructions.md`
- `.github/ISSUE_TEMPLATE/feature.yml`, `bug.yml`, `refactor.yml`
- `.github/pull_request_template.md`
- `docs/development/service-template.md`
- 各 `docs/services/*/testing.md`

確認観点:
- 「80%以上」の記述が全ファイルで一貫しているか
- 「カバレッジ」の計測対象（branches/functions/lines/statements）に矛盾がないか

#### 9. ライブラリ依存方向の記載一貫性

確認ファイル（16ファイル）:
- `docs/development/shared-libraries.md`
- `docs/development/architecture.md`
- `.github/copilot-instructions.md`
- `docs/development/rules.md`
- 各 `docs/libs/*/README.md`
- 各 `docs/services/*/architecture.md`

確認観点:
- 依存方向 `ui → browser → common` の表記が全ファイルで一致しているか
- `react`, `nextjs`, `aws` の位置づけが全ファイルで一貫しているか

#### 10. MUST/SHOULD ルールの重複と矛盾

確認観点:
- `docs/development/rules.md` で MUST と定義されているルールが他のドキュメントで SHOULD（推奨）と記述されていないか
- 複数ドキュメントに同一ルールが記載されている場合、記述内容に矛盾がないか

#### 11. ドキュメント間のリンク切れチェック

確認観点:
- `docs/README.md` のリンクが現在のファイル構成と一致しているか
- 各ドキュメント内の相互参照リンクが現在のファイルパスと一致しているか
- `.github/copilot-instructions.md` 内の `<a>` タグリンクが有効なパスを指しているか

#### 12. ドキュメント間の重複記述チェック

確認観点:
- 同一ルールが複数ドキュメントに詳細記述されており、更新漏れリスクがある箇所を特定する
- 重複がある場合、DRY原則に基づいてリファレンスを一元化できるか検討する

### Priority 4: 実装との乖離（任意）

#### 13. 実装との乖離チェック

確認観点:
- `docs/development/architecture.md` のディレクトリ構成が実際の各サービスのディレクトリ構成と一致しているか
- `docs/development/shared-libraries.md` のビルド順序と `.github/workflows/` の実際のビルドステップが一致しているか

#### 14. 方針変更の追従漏れチェック（⚠️ 変更が検出されているため必須）

確認観点:
- 過去1週間（2026-03-02〜2026-03-09）に変更された開発方針ドキュメントを特定する
- 方針変更の内容を関連する全ドキュメントに追従できているか確認する
- `.github/copilot-instructions.md`, Issue Template, PR Template への反映漏れがないか確認する

## タスク

### Phase 1: 現状調査

- [ ] T001: git log で過去1週間に変更されたドキュメントファイルを一覧化する
- [ ] T002: Priority 1 の4項目を確認し、不整合を記録する
- [ ] T003: Priority 2 の3項目を確認し、不整合を記録する
- [ ] T004: Priority 3 の5項目を確認し、不整合を記録する
- [ ] T005: Priority 4 の2項目を確認し（方針変更分は必須）、不整合を記録する

### Phase 2: 修正

- [ ] T006: Priority 1 の不整合を修正する（必須）
- [ ] T007: Priority 2 の不整合を修正する（推奨）
- [ ] T008: Priority 3 の不整合を修正する（推奨）
- [ ] T009: Priority 4 の不整合を修正する（任意・方針変更追従は必須）

### Phase 3: 完了処理

- [ ] T010: Issue のコメントに発見した問題と修正内容を記録する
- [ ] T011: 修正内容をPRに含めて提出する
- [ ] T012: レビュー完了後にIssueをクローズする

## 実装のヒント

- `git log --since="2026-03-02" --until="2026-03-09" -- docs/ .github/ --name-only --oneline` で変更ファイルを効率的に特定できる
- `grep -rn "80" docs/ .github/ --include="*.md" --include="*.yml"` でカバレッジ記述を横断検索できる
- `grep -rn "ui.*browser.*common\|browser.*common" docs/ .github/ --include="*.md"` で依存方向の記述を検索できる
- リンク切れは `find docs/ -name "*.md" | xargs grep -l "\[.*\](" | xargs grep -oP '\[.*?\]\(.*?\)'` で抽出できる

## 参考ドキュメント

- [コーディング規約](../docs/development/rules.md)
- [テスト戦略](../docs/development/testing.md)
- [アーキテクチャ方針](../docs/development/architecture.md)
- [ブランチ戦略](../docs/branching.md)
- [共通ライブラリ設計](../docs/development/shared-libraries.md)
- [ドキュメント全般](../docs/README.md)

## 備考・未決定事項

- 「過去1週間で更新されたドキュメント数: 103ファイル」と記載があるが、開発方針ドキュメントの変更詳細が Issue に記載されていない。T001 で実際の変更内容を確認してから T005 を実施する。
- 修正が大規模になる場合は、Priority ごとに複数のPRに分割することを検討する。
