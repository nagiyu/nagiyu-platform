# 2026年第11週 週次ドキュメントレビュー 対応 - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/ に反映し、
    tasks/issue-2257-weekly-docs-review/ ディレクトリごと削除します。

    入力: tasks/issue-2257-weekly-docs-review/requirements.md
    次に作成するドキュメント: tasks/issue-2257-weekly-docs-review/tasks.md
-->

## コンポーネント設計

### パッケージ責務分担

| 対象 | 変更内容 |
| ---- | -------- |
| `.github/workflows/templates/weekly-review-body.md` | リンクチェッカースクリプトの修正 |
| `services/niconico-mylist-assistant/batch/jest.config.ts` | `coverageThreshold` の追加（方針Aの場合） |
| `docs/development/testing.md` | batch 例外の明記（方針Bの場合） |

---

## リンクチェッカーの修正設計

### 現在のアルゴリズム（問題あり）

現在のスクリプトはすべてのリンクを一覧化した後、`docs/$link` が存在するかをチェックする。これはファイルごとの相対パス解決を行わないため、相対パス形式（`./requirements.md` や `../../README.md` など）を持つリンクがすべて誤検知される。

### 修正後のアルゴリズム

各 `.md` ファイルに含まれるリンクを、そのファイルのディレクトリを基準として相対パスを解決し、ファイルの存在確認を行う。

**設計方針**:

- Python スクリプトを使用する（bash の相対パス解決の複雑さを避けるため）
- 各リンクをソースファイルのディレクトリから `os.path.normpath(os.path.join(source_dir, link))` で解決する
- HTTP/HTTPS リンクはスキップする
- アンカー（`#`）を除いてファイルパスのみを検査する
- 結果は `❌ リンク切れ: {source_file}: {link}` の形式で出力する（どのファイルから参照されているかを明示）

**修正後の出力形式**:

```
[BROKEN] docs/services/example/README.md: ./not-exist.md
```

既存の週次レビューワークフローでは `❌` 絵文字を使用しているが、CI 環境での文字化けリスクを考慮し、出力マーカーは `[BROKEN]` などのテキストベース形式への変更も検討すること。

---

## `niconico-mylist-assistant/batch` の coverageThreshold 設計

### 採用方針

**方針A（推奨）**: `coverageThreshold` を80%に設定する。

- **理由**: 他の batch パッケージ（codec-converter、stock-tracker）と統一し、標準パターンに従う
- `niconico-mylist-assistant/batch` にも unit test が存在するため、カバレッジチェックは有効
- コメントにある「integration tests で検証する」は unit test との補完関係であり、coverageThreshold 省略の正当な理由にはならない

### jest.config.ts への追加内容

他の batch パッケージと同様の設定を追加する:

```typescript
coverageThreshold: {
    global: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
    },
},
```

また、不正確なコメントを削除または修正する。

---

## 実装上の注意点

### 依存関係・前提条件

- リンクチェッカースクリプトの修正は `.github/` 配下のテンプレートファイルへの変更であり、CI/CDの再実行により次回の週次レビューから反映される
- `niconico-mylist-assistant/batch` の `coverageThreshold` 追加後、`npm run test:coverage` を実行してカバレッジが80%以上であることを確認する

### セキュリティ考慮事項

- 特になし（ドキュメント・設定変更のみ）

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `docs/development/testing.md` に統合すること（方針Bを採用した場合のみ）：
      batch パッケージの coverageThreshold 設定方針と例外条件を追記
- [ ] `docs/services/niconico-mylist-assistant/testing.md` を確認すること：
      coverageThreshold に関する記述があれば更新
