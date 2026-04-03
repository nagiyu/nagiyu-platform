<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に docs/development/testing.md に統合して削除します。
-->

# 2026年第13週 ドキュメントレビュー - 要件定義

---

## 1. ビジネス要件

### 1.1 背景・目的

週次ドキュメントレビュー (Issue #2474) の一環として、コードベースとドキュメントの整合性を確認した。
調査の結果、`services/stock-tracker/web` の Jest カバレッジ閾値が標準（80%）と乖離していることが判明した。
本タスクはその乖離を解消し、リポジトリのドキュメントとコード設定を一致させることを目的とする。

### 1.2 対象ユーザー

- 開発者（コードベースを参照して設定を理解する人）

### 1.3 ビジネスゴール

- `docs/development/testing.md` に記載されたカバレッジ基準（80%以上）と実際の Jest 設定を一致させる

---

## 2. 機能要件

### 2.1 ユースケース

#### UC-001: カバレッジ閾値の標準化

- **概要**: `services/stock-tracker/web/jest.config.ts` の coverageThreshold を標準値（80%）に修正する
- **アクター**: 開発者（CI/CD パイプライン含む）
- **前提条件**: `docs/development/testing.md` にカバレッジ基準（80%以上）が定義されている
- **正常フロー**:
    1. `jest.config.ts` の `coverageThreshold` を 100% → 80% に変更する
    2. テストを実行しカバレッジが 80% 以上であることを確認する
    3. CI が通過することを確認する
- **代替フロー**: なし
- **例外フロー**: カバレッジが 80% を下回る場合はテストを追加する

### 2.2 機能一覧

| ID | 機能 | 優先度 |
|----|------|--------|
| FR-001 | `jest.config.ts` の coverageThreshold を 80% に変更 | 必須 |

---

## 3. 非機能要件

| ID | 要件 | 基準 |
|----|------|------|
| NFR-001 | テストカバレッジ | 変更後も既存テストがすべて通過すること |
| NFR-002 | CI 通過 | GitHub Actions の stock-tracker-verify ワークフローが通過すること |

---

## 4. スコープ外

- `docs/development/testing.md` 本文の変更（今回の修正により不要）
- 他サービスのカバレッジ設定の見直し（本レビューで問題なし確認済み）
- 新規テストの追加（既存カバレッジが 80% 以上であることが前提）

---

## 5. 受け入れ条件

- [ ] `services/stock-tracker/web/jest.config.ts` の coverageThreshold が 80% に設定されている
- [ ] `npm run test:coverage` が stock-tracker/web で通過する
- [ ] `docs/development/testing.md` との整合性が取れている
