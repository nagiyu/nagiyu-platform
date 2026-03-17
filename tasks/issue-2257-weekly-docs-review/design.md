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
| `docs/services/niconico-mylist-assistant/testing.md` | `coverageThreshold` 未設定の理由を追記 |

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

## `niconico-mylist-assistant/batch` の coverageThreshold ドキュメント設計

### 現状と対応方針

`niconico-mylist-assistant/batch` は実際のニコニコ動画サイトへ Playwright でアクセスする統合テスト専用パッケージのため、`jest.config.ts` に `coverageThreshold` を設定しない設計が意図的に取られている。

`docs/services/niconico-mylist-assistant/testing.md` のセクション5「カバレッジ目標」に、batch パッケージの `coverageThreshold` が設定されていない理由を追記する。

プラットフォーム汎用ドキュメント（`docs/development/testing.md`）には個別サービスの事情は記載しない。

---

## 実装上の注意点

### 依存関係・前提条件

- リンクチェッカースクリプトの修正は `.github/` 配下のテンプレートファイルへの変更であり、CI/CDの再実行により次回の週次レビューから反映される
- `docs/services/niconico-mylist-assistant/testing.md` の追記のみで `jest.config.ts` のコードは変更しない

### セキュリティ考慮事項

- 特になし（ドキュメント・設定変更のみ）

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `docs/development/testing.md` には追記不要（個別サービスの事情はサービス側ドキュメントに記載する）
- [ ] `docs/services/niconico-mylist-assistant/testing.md` のセクション5を確認・更新すること：
      batch パッケージの `coverageThreshold` が設定されていない理由（Playwright 統合テストで実サイトをテストするため Unit Test が困難）を明記
