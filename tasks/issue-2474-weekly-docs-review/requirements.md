<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に docs/ の各ドキュメントに統合して削除します。
-->

# 2026年第13週 週次ドキュメントレビュー 対応 - 要件定義

---

## 1. ビジネス要件

### 1.1 背景・目的

Issue #2474（2026-03-30 自動作成）の週次ドキュメントレビューにおいて、
プラットフォーム全体のドキュメント整合性を確認した結果、
`copilot-instructions.md` のサービス一覧が実際のモノレポ構成と乖離していることが判明した。
また、`stock-tracker/web` の `coverageThreshold` が他サービスと異なる 100% に設定されており、
意図的な設定かどうかの確認と記録が必要である。

本対応の目的は、ドキュメントの整合性を回復し、開発者がプロジェクト全体の構成を
正確に把握できる状態を維持することである。

### 1.2 対象ユーザー

- 開発者（Copilot Review で copilot-instructions.md を参照する利用者）
- 新規参加開発者（モノレポ構成を把握するために docs/ を参照する利用者）

### 1.3 ビジネスゴール

- copilot-instructions.md のサービス一覧を現在のモノレポ構成と一致させる
- stock-tracker/web の coverageThreshold 100% 設定の意図を確認・記録する

---

## 2. 機能要件

### 2.1 機能一覧

| 機能ID | 機能名 | 説明 | 優先度 |
| ------ | ------ | ---- | ------ |
| F-001 | copilot-instructions サービス一覧更新 | services/ の全サービスを網羅的に記載する | 高 |
| F-002 | stock-tracker/web カバレッジ設定確認 | 100% 設定の意図を確認し、必要に応じて修正またはコメント追記 | 中 |

### 2.2 調査結果サマリー

#### Priority 1: 二重管理の整合性（必須）

| # | チェック項目 | 状態 | 詳細 |
| - | ----------- | ---- | ---- |
| 1 | Copilot Instructions ⇄ rules.md | ⚠️ 不整合 | copilot-instructions.md のサービス一覧が古い |
| 2 | Jest Coverage Threshold ⇄ testing.md | ⚠️ 要確認 | stock-tracker/web が 100%（他は 80%）。意図的かどうか確認が必要 |
| 3 | Issue Template ⇄ rules.md | ✅ 整合 | テストカバレッジ 80% が feature.yml / bug.yml に含まれている |
| 4 | PR Template ⇄ development ドキュメント | ✅ 整合 | PR テンプレートに「テストカバレッジ80%以上を確保」が含まれている |

#### Priority 2: 構造的整合性（推奨）

| # | チェック項目 | 状態 | 詳細 |
| - | ----------- | ---- | ---- |
| 5 | Branch Strategy | ✅ 整合 | branching.md とワークフローで一致 |
| 6 | Monorepo Structure | ⚠️ 不整合 | copilot-instructions.md のサービス一覧が古い（F-001 と同一問題） |
| 7 | Test Device Configuration | ✅ 整合 | ワークフロー・ドキュメントで chromium-mobile/desktop・webkit-mobile の if 条件が一致 |

#### Priority 3: ドキュメント間の整合性（推奨）

| # | チェック項目 | 状態 | 詳細 |
| - | ----------- | ---- | ---- |
| 8 | テストカバレッジ 80% の記載一貫性 | ✅ 整合 | rules.md・testing.md・branching.md・copilot-instructions.md で「80%以上」で統一 |
| 9 | ライブラリ依存方向の記載一貫性 | ✅ 整合 | 全ドキュメントで `ui → browser → common` で統一 |
| 10 | MUST/SHOULD ルールの重複と矛盾 | ✅ 整合 | rules.md が SSOT（Single Source of Truth）として機能、他ドキュメントはリンク参照 |
| 11 | ドキュメント間のリンク切れ | ✅ 問題なし | 自動チェックにより検出なし |
| 12 | ドキュメント間の重複記述 | ✅ 整合 | 意図的な重複（各ドキュメントの読者に必要な情報）と判断 |

#### Priority 4: 実装との乖離（任意）

| # | チェック項目 | 状態 | 詳細 |
| - | ----------- | ---- | ---- |
| 13 | 実装との乖離チェック | ✅ 整合 | rules.md の MUST ルールが実際のコードで守られていることを確認 |
| 14 | 方針変更の追従漏れチェック | ✅ 整合 | 過去1週間の docs/ 変更は少なく、追従漏れなし |

### 2.3 発見された不整合の詳細

#### 不整合 1: copilot-instructions.md のサービス一覧が古い

**現状**:

```text
services/          # アプリケーション
├── stock-tracker/            # 株価トラッカー（core + web + batch）
├── niconico-mylist-assistant/ # ニコニコマイリスト管理（core + web + batch）
└── share-together/           # みんなでシェアリスト（core + web）
```

**実際の services/ 構成**:

```text
services/
├── admin/
├── auth/
├── codec-converter/
├── niconico-mylist-assistant/
├── share-together/
├── stock-tracker/
└── tools/
```

→ `admin`, `auth`, `codec-converter`, `tools` の 4 サービスが未記載。

**修正方針**: copilot-instructions.md のモノレポ構成図に 4 サービスを追加する。

#### 不整合 2: stock-tracker/web の coverageThreshold が 100%

**現状**: `services/stock-tracker/web/jest.config.ts` で `coverageThreshold: 100%` に設定。

**ドキュメント**: testing.md・rules.md では「80%以上」と記述。

→ 100% は「80%以上」の要件を満たしているが、他の全サービスとの一貫性がなく、
意図的な設定かどうかが不明。CI が過剰に厳しい可能性がある。

**修正方針**: 意図的であれば jest.config.ts にコメントを追加する。
意図的でなければ 80% に統一する（実装時に担当者が判断）。

---

## 3. 非機能要件

### 3.1 パフォーマンス要件

- 変更はドキュメント・設定ファイルの修正のみであり、パフォーマンス影響なし

### 3.2 セキュリティ要件

- 変更はドキュメント・設定ファイルの修正のみであり、セキュリティ影響なし

### 3.3 保守性・拡張性要件

- 今後サービスが追加された際、copilot-instructions.md のサービス一覧も更新すること
- サービス追加時の更新漏れを防ぐため、PR チェックリストまたは docs/ に明記することを検討

---

## 4. ドメインオブジェクト

| エンティティ | 説明 |
| ----------- | ---- |
| copilot-instructions.md | Copilot Review 用カスタムインストラクション（モノレポ構成・コーディング規約等を記載） |
| jest.config.ts | サービス・ライブラリの Jest 設定ファイル（coverageThreshold を定義） |
| testing.md | テスト戦略ドキュメント（カバレッジ基準・CI 設定の SSOT） |

---

## 5. スコープ外

- ❌ 各サービスの実装コードの修正
- ❌ CI/CD ワークフローファイルの変更
- ❌ 他の週次レビューチェックリスト項目（整合していることを確認済み）
- ❌ quick-clip サービスのドキュメント整備（別 Issue で対応）
