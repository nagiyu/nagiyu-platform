<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に各 docs/ ファイルに統合して削除します。
-->

# 週次ドキュメントレビュー 2026年第14週 - 要件定義

## 1. ビジネス要件

### 1.1 背景・目的

2026年第14週（2026-04-06）の週次ドキュメントレビュー（Issue #2610）において、以下の点を確認・修正する。

- **構造的な問題**: ドキュメント間の不整合・二重管理の乖離を発見・解消する
- **品質維持**: 実装とドキュメントが乖離しないよう、定期的な整合性チェックを実施する

本タスクは Issue #2610 のチェックリストに基づき、各優先度の項目を調査・修正する。

### 1.2 対象ユーザー

- プラットフォーム開発者（AI エージェント・人間）
- コードレビュアー

### 1.3 ビジネスゴール

- ドキュメント間の整合性を維持し、誤った情報に基づく実装を防ぐ
- Copilot Instructions を最新の状態に保ち、AI エージェントが正確な情報をもとに動作できるようにする

---

## 2. 機能要件

### 2.1 調査・修正スコープ

#### Priority 1（必須）: 二重管理の整合性

| 項目 | 調査内容 | 対応要否 |
|------|---------|---------|
| P1-1 | Copilot Instructions ⇄ `docs/development/rules.md` の整合性 | 要調査 |
| P1-2 | Jest `coverageThreshold` ⇄ `docs/development/testing.md` の整合性 | 要調査 |
| P1-3 | Issue Template ⇄ `docs/development/rules.md` の整合性 | 要調査 |
| P1-4 | PR Template ⇄ development ドキュメントの整合性 | 要調査 |

#### Priority 2（推奨）: 構造的整合性

| 項目 | 調査内容 | 対応要否 |
|------|---------|---------|
| P2-1 | Branch Strategy: `docs/branching.md` と `copilot-instructions.md` の一致 | 要調査 |
| P2-2 | Monorepo Structure: `copilot-instructions.md` のサービス一覧 | **要修正** |
| P2-3 | Test Device Configuration: 3ファイル間の一致 | 要調査 |

#### Priority 3（推奨）: ドキュメント間の整合性

| 項目 | 調査内容 |
|------|---------|
| P3-1 | テストカバレッジ 80% の記載一貫性（12ファイル） |
| P3-2 | ライブラリ依存方向の記載一貫性（16ファイル） |
| P3-3 | MUST/SHOULD ルールの重複と矛盾 |
| P3-4 | ドキュメント間のリンク切れチェック（✅ Issue 作成時点で問題なし） |
| P3-5 | ドキュメント間の重複記述チェック |

#### Priority 4（任意）: 実装との乖離

| 項目 | 調査内容 |
|------|---------|
| P4-1 | 実装との乖離チェック（`rules.md` の MUST ルールがコードで守られているか） |
| P4-2 | 方針変更の追従漏れチェック（⚠️ 変更検出あり: `bc6f927`） |

### 2.2 既知の問題（調査済み）

#### 問題1: Copilot Instructions のサービス一覧が古い

- **場所**: `.github/copilot-instructions.md` → `### モノレポ構成` セクション
- **現状**: 3サービスのみ記載（`stock-tracker`, `niconico-mylist-assistant`, `share-together`）
- **実態**: 8サービスが存在（`admin`, `auth`, `codec-converter`, `niconico-mylist-assistant`, `quick-clip`, `share-together`, `stock-tracker`, `tools`）
- **対応**: Copilot Instructions のサービス一覧を実態に合わせて更新する

#### 問題2（参考）: `niconico-mylist-assistant/batch` の coverageThreshold 未設定

- **場所**: `services/niconico-mylist-assistant/batch/jest.config.ts`
- **現状**: `coverageThreshold` が未設定
- **理由**: `src/playwright-automation.ts` が Playwright のブラウザプロセス起動に直接依存しており、Jest 単体テスト環境でのモック化が困難なため
- **対応**: `docs/development/testing.md` に例外として文書化済み。**追加対応不要**

### 2.3 機能一覧

| 機能ID | 機能名 | 説明 | 優先度 |
|--------|--------|------|--------|
| F-001 | Priority 1 調査・修正 | 二重管理の整合性チェックと修正 | 高 |
| F-002 | Priority 2 調査・修正 | 構造的整合性チェックと修正 | 中 |
| F-003 | Priority 3 調査 | ドキュメント間整合性チェック | 中 |
| F-004 | Priority 4 調査 | 実装との乖離チェック | 低 |

---

## 3. 非機能要件

### 3.1 品質要件

- 修正後のドキュメントはリポジトリの Markdown フォーマット（4スペースインデント）に準拠すること
- リポジトリルールに違反しないこと
- 実装を行わないこと（ドキュメント修正のみ）

### 3.2 スコープ制約

- 本タスクは**ドキュメントの調査・修正のみ**を対象とする
- 実装コードの変更（テストカバレッジ向上・リファクタリング等）は別タスクで対応する

---

## 4. スコープ外

- ❌ 実装コードの変更（テストカバレッジ向上、リファクタリング等）
- ❌ 新規ドキュメントの大規模追加
- ❌ `niconico-mylist-assistant/batch` の Playwright 依存分離（将来タスクとして検討）
