<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に docs/services/{service}/requirements.md に統合して削除します。
-->

# 2026年第11週 週次ドキュメントレビュー 対応 - 要件定義

---

## 1. ビジネス要件

### 1.1 背景・目的

Issue #2257（2026年第11週の週次ドキュメントレビュー）を調査した結果、以下の問題を発見した。

1. **週次レビューのリンクチェッカースクリプトのバグ**: `.github/workflows/templates/weekly-review-body.md` のリンク検証スクリプトが相対パスを正しく解決せず、実際には存在するリンクを60件以上「リンク切れ」として誤検知する。
2. **`niconico-mylist-assistant/batch` の `coverageThreshold` 未設定**: 他の batch パッケージ（`codec-converter`、`stock-tracker`）は80%の閾値を設定しているが、`niconico-mylist-assistant/batch` は未設定。`docs/development/testing.md` にもこの例外が記載されていない。

本タスクは上記の問題を修正し、週次ドキュメントレビューの品質と信頼性を向上させることを目的とする。

### 1.2 対象

- プラットフォーム全体（週次レビューワークフロー）
- `services/niconico-mylist-assistant/batch/`
- `docs/services/niconico-mylist-assistant/testing.md`

### 1.3 ビジネスゴール

- 週次ドキュメントレビューで誤検知ゼロを実現し、実際の問題のみが報告される状態にする
- `niconico-mylist-assistant/batch` の `coverageThreshold` 未設定の理由をサービス側のドキュメントに明記する

---

## 2. 機能要件

### 2.1 発見した問題と対応方針

#### FR1: リンクチェッカースクリプトの修正

**現状**: `.github/workflows/templates/weekly-review-body.md` に含まれるリンクチェックスクリプトが次の誤ったアルゴリズムを使用している。

```bash
grep -roh '\[.*\]([^)]*\.md[^)]*)' docs/ | sed 's/.*(\(.*\))/\1/' | sort -u | while read link; do
  [ ! -f "docs/$link" ] && echo "❌ リンク切れ: $link"
done
```

このスクリプトはすべてのリンクを `docs/` ディレクトリ直下からの相対パスとして検査するため、ファイルごとの相対パス解決ができていない。

**調査結果**: Python による正確なパス解決（ファイルのディレクトリを基準に相対パスを解決）で確認したところ、`docs/` 配下の362リンクはすべて有効。誤検知のみであった。

**要件**: スクリプトをファイルごとの相対パスを正しく解決するように修正する。修正後のスクリプトは実際に存在しないリンクのみを報告すること。

#### FR2: `niconico-mylist-assistant/batch` の `coverageThreshold` ドキュメント追記

**現状**:
- `niconico-mylist-assistant/batch` は実際のニコニコ動画サイトに対して Playwright で動作する統合テスト専用のパッケージ
- Unit Test が困難な実装（外部サイトへの依存）のため、`jest.config.ts` に `coverageThreshold` が意図的に設定されていない
- `docs/services/niconico-mylist-assistant/testing.md` のセクション5「カバレッジ目標」には「batch パッケージ: 統合テストで主要フローをカバー」と記載されているが、`jest.config.ts` に `coverageThreshold` が設定されていない理由の説明がない

**対応方針**:

- `docs/services/niconico-mylist-assistant/testing.md` に `coverageThreshold` が設定されていない理由（Playwright 統合テストで実サイトをテストするため Unit Test が困難）を明記する
- プラットフォーム汎用ドキュメント（`docs/development/testing.md`）には個別サービスの事情は記載しない

**要件**: `docs/services/niconico-mylist-assistant/testing.md` に `coverageThreshold` 未設定の理由を追記すること。`jest.config.ts` のコードはそのまま維持する。

### 2.2 Priority 1-4 チェック結果

#### Priority 1（必須項目）

| 項目 | 状態 | 詳細 |
| ---- | ---- | ---- |
| 1. Copilot Instructions ⇄ rules.md | ✅ 問題なし | MUST ルール・テストカバレッジ・依存方向性が一致 |
| 2. Jest Coverage Threshold ⇄ testing.md | ⚠️ 要対応 | niconico-mylist-assistant/batch の coverageThreshold 未設定の理由がドキュメント化されていない（FR2参照） |
| 3. Issue Template ⇄ rules.md | ✅ 問題なし | bug/feature/refactor の3テンプレート全てが rules.md への参照あり。feature・refactor には「テストカバレッジ80%以上を確保した」チェック項目あり |
| 4. PR Template ⇄ development ドキュメント | ✅ 問題なし | 「テストカバレッジ80%以上を確保」「関連ドキュメントを更新した」チェック項目あり |

#### Priority 2（推奨項目）

| 項目 | 状態 | 詳細 |
| ---- | ---- | ---- |
| 5. Branch Strategy の整合性 | ✅ 問題なし | `docs/branching.md` と `copilot-instructions.md` 両方で `feature → integration → develop → master`・Fast CI (chromium-mobile のみ)・Full CI (全デバイス) が一致 |
| 6. Monorepo Structure の整合性 | ✅ 問題なし | `docs/development/shared-libraries.md` と `copilot-instructions.md` で libs 構成・依存方向性（`ui → browser → common`）が一致 |
| 7. Test Device Configuration の整合性 | ✅ 問題なし | `docs/development/testing.md` と各 verify workflow で Fast CI (chromium-mobile のみ、常時) / Full CI (chromium-desktop・webkit-mobile、`if: github.base_ref == 'develop'`) が一致 |

#### Priority 3（推奨項目）

| 項目 | 状態 | 詳細 |
| ---- | ---- | ---- |
| 8. テストカバレッジ 80% の記載一貫性 | ✅ 問題なし | 28 ファイルすべてで「80%」が一貫して同じ基準（branches, functions, lines, statements すべて 80%）を指している |
| 9. ライブラリ依存方向の記載一貫性 | ✅ 問題なし | `shared-libraries.md`・`rules.md`・`task.proposal.README.md`・`copilot-instructions.md` で「`ui → browser → common`」が統一されている |
| 10. MUST/SHOULD ルールの重複と矛盾 | ✅ 問題なし（意図的な重複） | `rules.md` が Single Source of Truth。`architecture.md` に rules.md と同等の MUST ルールが含まれているが、内容が一致しており意図的な重複として許容される |
| 11. ドキュメント間のリンク切れ | ✅ 問題なし（誤検知） | 実際のリンクは全362件有効。スクリプトのバグ（FR1参照） |
| 12. ドキュメント間の重複記述 | ✅ 問題なし（意図的な重複） | 重複は各ドキュメントの読者に必要な情報の繰り返しであり、意図的 |

#### Priority 4（任意項目）

| 項目 | 状態 | 詳細 |
| ---- | ---- | ---- |
| 13. 実装との乖離 | ✅ 問題なし（サンプリング確認） | 以下をサンプリング確認: (1) `services/stock-tracker/web/` の ERROR_MESSAGES 定数化 ✅、(2) `services/` 全体で `dangerouslySetInnerHTML` の不使用 ✅、(3) `libs/` 全体で `@/` パスエイリアスの不使用 ✅ |
| 14. 方針変更の追従漏れ | ✅ 問題なし | 過去1週間の `docs/development/` 変更は PR#2256 のみ（devcontainer と weekly-issues テンプレートの更新）。MUST ルール変更なし |

---

## 3. 非機能要件

### NFR1: スクリプトの正確性

修正後のリンクチェッカーは、ファイルの相対パスを正しく解決して検査すること。誤検知率をゼロにすること。

### NFR2: 整合性の維持

修正後も既存の週次レビューワークフローのフォーマット・出力形式を維持すること。

---

## 4. 受け入れ基準

- [ ] リンクチェッカースクリプトを修正後に実行し、誤検知が出ないこと
- [ ] `docs/services/niconico-mylist-assistant/testing.md` に `coverageThreshold` 未設定の理由が明記されていること
- [ ] Priority 1-4 のチェック結果が Issue #2257 にコメントで記録されていること
