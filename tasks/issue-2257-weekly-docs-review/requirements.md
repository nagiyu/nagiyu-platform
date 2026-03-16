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
- `docs/development/testing.md`

### 1.3 ビジネスゴール

- 週次ドキュメントレビューで誤検知ゼロを実現し、実際の問題のみが報告される状態にする
- すべての batch パッケージで `coverageThreshold` の扱いを統一し、`testing.md` に明示する

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

#### FR2: `niconico-mylist-assistant/batch` の `coverageThreshold` 対応

**現状**:
- `codec-converter/batch/jest.config.ts` と `stock-tracker/batch/jest.config.ts` は80%の `coverageThreshold` を設定済み
- `niconico-mylist-assistant/batch/jest.config.ts` には `coverageThreshold` がなく、「integration tests で検証する」というコメントのみ存在する
- `docs/development/testing.md` にはこの例外の記載がない

**対応方針（選択肢）**:

- **方針A（推奨）**: 他の batch パッケージと同様に80%の `coverageThreshold` を追加する
- **方針B**: 例外として `testing.md` に明記し、`niconico-mylist-assistant/batch` の特殊な理由を記録する

方針A を採用する場合、`testing.md` の更新は不要（標準パターンを遵守するため）。  
方針B を採用する場合、`testing.md` に batch パッケージの `coverageThreshold` 設定方針と例外条件を追記する。

**要件**: `niconico-mylist-assistant/batch` の `coverageThreshold` の扱いを決定し、他の batch パッケージとの整合性を取ること。

### 2.2 Priority 1-4 チェック結果

#### Priority 1（必須項目）

| 項目 | 状態 | 詳細 |
| ---- | ---- | ---- |
| 1. Copilot Instructions ⇄ rules.md | ✅ 問題なし | MUST ルール・テストカバレッジ・依存方向性が一致 |
| 2. Jest Coverage Threshold ⇄ testing.md | ⚠️ 要対応 | niconico-mylist-assistant/batch の coverageThreshold 未設定（FR2参照） |
| 3. Issue Template ⇄ rules.md | 未確認 | 手動確認が必要 |
| 4. PR Template ⇄ development ドキュメント | 未確認 | 手動確認が必要 |

#### Priority 2（推奨項目）

| 項目 | 状態 | 詳細 |
| ---- | ---- | ---- |
| 5. Branch Strategy の整合性 | 未確認 | 手動確認が必要 |
| 6. Monorepo Structure の整合性 | 未確認 | 手動確認が必要 |
| 7. Test Device Configuration の整合性 | 未確認 | 手動確認が必要 |

#### Priority 3（推奨項目）

| 項目 | 状態 | 詳細 |
| ---- | ---- | ---- |
| 8. テストカバレッジ 80% の記載一貫性 | 未確認 | 手動確認が必要 |
| 9. ライブラリ依存方向の記載一貫性 | 未確認 | 手動確認が必要 |
| 10. MUST/SHOULD ルールの重複と矛盾 | 未確認 | 手動確認が必要 |
| 11. ドキュメント間のリンク切れ | ✅ 問題なし（誤検知） | 実際のリンクは全362件有効。スクリプトのバグ（FR1参照） |
| 12. ドキュメント間の重複記述 | 未確認 | 手動確認が必要 |

#### Priority 4（任意項目）

| 項目 | 状態 | 詳細 |
| ---- | ---- | ---- |
| 13. 実装との乖離 | 未確認 | 手動確認が必要 |
| 14. 方針変更の追従漏れ | 未確認 | 手動確認が必要 |

---

## 3. 非機能要件

### NFR1: スクリプトの正確性

修正後のリンクチェッカーは、ファイルの相対パスを正しく解決して検査すること。誤検知率をゼロにすること。

### NFR2: 整合性の維持

修正後も既存の週次レビューワークフローのフォーマット・出力形式を維持すること。

---

## 4. 受け入れ基準

- [ ] リンクチェッカースクリプトを修正後に実行し、誤検知が出ないこと
- [ ] `niconico-mylist-assistant/batch` の `coverageThreshold` の扱いが決定・対応済みであること
- [ ] Priority 1-4 のチェックリスト項目を手動で確認し、Issue #2257 にコメントで記録すること
