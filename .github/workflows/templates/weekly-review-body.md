## 📚 週次ドキュメントレビュー

実装時のドキュメント更新では気づきにくい**構造的な問題**と**二重管理の不整合**を発見するための定期レビューです。

⚠️ **このレビューは普段のPRでのドキュメント更新を免除するものではありません。**

---

## 📊 自動収集メトリクス

| 項目 | 値 |
|------|-----|
| 過去1週間で更新されたドキュメント数 | **{{UPDATED_DOCS}} ファイル** |
| 前回のレビュー Issue | {{PREV_ISSUE}} |
| 次回レビュー予定 | {{NEXT_DATE}} |

### 🔄 開発方針ドキュメントの変更履歴

{{POLICY_CHANGES_SECTION}}

---

## ✅ レビュー手順

1. **このIssueを担当者にアサイン**
2. **下記のチェックリストを埋めながらレビュー実施**
3. **発見した問題をコメントに記録**
4. **必要に応じて修正PRを作成**
5. **レビュー完了後、このIssueをクローズ**

---

## 📋 チェックリスト

### 🔴 Priority 1: 二重管理の整合性（必須）

- [ ] 1. Copilot Instructions ⇄ rules.md の整合性
- [ ] 2. Jest Coverage Threshold ⇄ testing.md の整合性
- [ ] 3. Issue Template ⇄ rules.md の整合性
- [ ] 4. PR Template ⇄ development ドキュメントの整合性

<details>
<summary>詳細なチェック項目</summary>

#### 1. Copilot Instructions ⇄ rules.md
- MUST/SHOULD/MAY/MUST NOT ルールが一致
- テストカバレッジ 80% が両方に記載
- エラーメッセージ日本語 + 定数化が一致
- ライブラリ依存の一方向性 (ui → browser → common) が一致
- パスエイリアス禁止ルール (ライブラリ内) が一致
- `dangerouslySetInnerHTML` 禁止ルールが一致

**確認コマンド:**
```bash
# MUSTルールの比較
grep -n "MUST" .github/copilot-instructions.md
grep -n "MUST:" docs/development/rules.md | head -20
```

#### 2. Jest Coverage Threshold ⇄ testing.md
- すべての `jest.config.ts` で `coverageThreshold` が 80%
- `testing.md` の「ビジネスロジック: 80%以上」記述と一致
- 新規サービス・ライブラリに `jest.config.ts` が存在し 80% 設定

**確認コマンド:**
```bash
# すべての jest.config.ts でカバレッジ設定を確認
find . -name "jest.config.ts" -exec echo "=== {} ===" \; -exec grep -A5 "coverageThreshold" {} \;
```

#### 3. Issue Template ⇄ rules.md
- チェックリスト項目が `rules.md` の MUST ルールをカバー
- 「テストカバレッジ80%以上」がチェック項目に含まれる

#### 4. PR Template ⇄ development ドキュメント
- PRチェックリストが最新のルールを反映
- 「テストカバレッジ80%以上」が記載
- 「関連ドキュメントを更新した」チェック項目が存在

</details>

### 🟡 Priority 2: 構造的整合性（推奨）

- [ ] 5. Branch Strategy の整合性
- [ ] 6. Monorepo Structure の整合性
- [ ] 7. Test Device Configuration の整合性

<details>
<summary>詳細なチェック項目</summary>

#### 5. Branch Strategy
- ブランチフロー (feature → integration → develop → master) が `.github/copilot-instructions.md` と `docs/branching.md` で一致
- Fast CI (integration/**) / Full CI (develop) の記述が一致

#### 6. Monorepo Structure
- `libs/` の構成 (common, browser, ui) が一致
- 依存関係の一方向性 (ui → browser → common) が一致
- 新規ライブラリがある場合、両方に記載

#### 7. Test Device Configuration
- Fast CI のデバイス (chromium-mobile) が3箇所で一致
- Full CI のデバイス (chromium-desktop, chromium-mobile, webkit-mobile) が一致

</details>

### 🟢 Priority 3: ドキュメント間の整合性（推奨）

- [ ] 8. テストカバレッジ 80% の記載一貫性（12ファイル）
- [ ] 9. ライブラリ依存方向の記載一貫性（16ファイル）
- [ ] 10. MUST/SHOULD ルールの重複と矛盾
- [ ] 11. ドキュメント間のリンク切れチェック
- [ ] 12. ドキュメント間の重複記述チェック

<details>
<summary>詳細なチェック項目</summary>

#### 8. テストカバレッジ 80% の記載一貫性
対象: 12ファイル
- すべてのドキュメントで「80%」が同じ基準（branches, functions, lines, statements）を指している
- 「ビジネスロジック」vs「全体」の適用範囲が明確に区別
- 例外ケース（UI層はE2Eでカバー等）が各ドキュメントで一貫

**確認コマンド:**
```bash
grep -r "80%" docs/ --include="*.md" | cut -d: -f1 | sort -u
```

#### 9. ライブラリ依存の一方向性の記載一貫性
対象: 16ファイル
- すべてのドキュメントで依存方向が「ui → browser → common」で統一
- 新規ライブラリが追加された場合、すべての関連ドキュメントに記載
- 循環依存禁止のルールがすべてのドキュメントで一貫

**確認コマンド:**
```bash
grep -r "ui → browser → common\|ui->browser->common" docs/ .github/ --include="*.md"
```

#### 10. MUST/SHOULD ルールの重複と矛盾
- `rules.md` がルールの「単一情報源 (Single Source of Truth)」になっている
- 他のドキュメント (architecture.md, testing.md 等) は `rules.md` を参照リンクで指している
- 重複して書かれているルールがある場合、内容が完全に一致
- `rules.md` にないルールが他のドキュメントに書かれていないか確認

#### 11. ドキュメント間のリンク切れチェック
- `docs/` 内の相互参照リンク (.md) がすべて有効
- 相対パスが正しい (../../ 等)
- リンク先のドキュメントが移動・削除されていないか確認

**確認コマンド:**
```bash
# Markdown リンクの抽出と存在確認
grep -roh '\[.*\]([^)]*\.md[^)]*)' docs/ | sed 's/.*(\(.*\))/\1/' | sort -u | while read link; do
  [ ! -f "docs/$link" ] && echo "❌ リンク切れ: $link"
done
```

#### 12. ドキュメント間の重複記述チェック
- 重複が意図的か（各ドキュメントの読者に必要な情報）
- 重複が不要な場合、Single Source of Truth を決めて他は参照リンクに変更
- 更新時に全箇所を更新する必要がある重複を洗い出した

</details>

### 🔵 Priority 4: 実装との乖離（任意）

- [ ] 13. 実装との乖離チェック
- [ ] 14. 方針変更の追従漏れチェック {{POLICY_WARNING}}

<details>
<summary>詳細なチェック項目</summary>

#### 13. 実装との乖離チェック
- `rules.md` の MUST ルールが実際のコードで守られているか（サンプリング確認）
- `architecture.md` の図が最新の構成を反映しているか
- `services/*/requirements.md` と実際の機能が一致しているか
- `infra/` ドキュメントと実際の AWS リソースが一致しているか

#### 14. 方針変更の追従漏れチェック
- 過去1週間の `docs/development/*.md` の変更履歴を確認した
- MUST → SHOULD への格下げがあった場合、Issue/PR テンプレートも更新されている
- テストカバレッジ基準の変更があった場合、すべての `jest.config.ts` が更新されている
- ライブラリ構成の変更があった場合、Copilot Instructions も更新されている
- 新しい MUST ルールが追加された場合、CI/CD で自動検証されている

**確認コマンド:**
```bash
git log --since="1 week ago" --oneline -- docs/development/ | head -20
```

</details>

---

## 📝 発見した問題

<!-- レビュー中に発見した問題をここに記録してください -->

---

**自動作成**: {{CREATE_TIME}} | **ワークフロー**: [weekly-docs-review.yml](.github/workflows/weekly-docs-review.yml)
