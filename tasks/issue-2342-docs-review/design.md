# Issue #2342 週次ドキュメントレビュー対応 - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/development/testing.md に統合し、
    tasks/issue-2342-docs-review/ ディレクトリごと削除します。

    入力: tasks/issue-2342-docs-review/requirements.md
    次に作成するドキュメント: tasks/issue-2342-docs-review/tasks.md
-->

## 変更概要

本タスクは API・データモデル・コンポーネント設計を伴わない**スクリプト修正とドキュメント追記**のみである。
設計のポイントは以下の 2 点。

1. リンク切れチェックスクリプトの「相対パス解決ロジック」の修正方針
2. `docs/development/testing.md` へのカバレッジ例外の追記箇所・記述方針

---

## リンク切れチェックスクリプトの修正方針

### 問題の構造

現行スクリプトは `grep -roh` で `docs/` 全体からリンクパスを抽出し、すべてのリンクを `docs/` 起点として解釈する。
しかし Markdown の相対リンクはリンクを**記述したファイルの位置**を基準に解決されるため、
サブディレクトリ深くにあるファイルのリンク（例: `../../README.md`）を `docs/` 起点で解釈すると誤った絶対パスになる。

| リンク記述元ファイル | リンクテキスト | 正しい解決先 | 現行スクリプトの解釈 |
| ------------------- | ------------- | ------------ | ------------------- |
| `docs/services/foo/bar.md` | `../../README.md` | `docs/README.md` | `docs/../../README.md`（リポジトリ外） |

### 修正アプローチの選択肢

| アプローチ | 概要 | 特徴 |
| ---------- | ---- | ---- |
| **A: Python スクリプト化** | `pathlib` を使いファイルごとに相対パスを解決するスクリプトを `.github/workflows/scripts/check-doc-links.py` として実装 | Python 3 は ubuntu-latest 標準搭載。ロジックが明確で可読性が高い |
| **B: Node.js スクリプト化** | `path` モジュールで同様の処理を実装する | リポジトリが TypeScript 主体のため親和性が高いが、依存関係管理が必要になる場合がある |
| **C: bash ワンライナー修正** | `while read file; do ... done` で各ファイルを起点に解決するよう bash スクリプトを修正 | 外部ランタイム不要だが、bash での相対パス解決は可読性・保守性が低い |

**選択**: アプローチ **A（Python スクリプト化）** を推奨する。
理由は以下のとおり。

- Python 3 は CI 環境・ローカル環境の両方で依存なしに実行可能
- `pathlib.Path.resolve()` による相対パス解決が直感的かつ安全
- スクリプトを `.github/workflows/scripts/` に分離することで weekly-review-body.md の確認コマンドを簡潔に保てる

### スクリプト配置

```
.github/
└── workflows/
    ├── scripts/
    │   └── check-doc-links.py    ← 新規作成（メインロジック）
    └── templates/
        └── weekly-review-body.md ← 確認コマンドを差し替え
```

### スクリプトの処理フロー（概念）

1. `docs/` 配下の全 `.md` ファイルを再帰的に列挙する
2. 各ファイルに対して `[テキスト](パス.md)` パターンのリンクを正規表現で抽出する
3. 抽出したリンクパスを**そのファイルの絶対パスを基準**に解決する
4. 解決後のパスが実在しない場合のみ「❌ リンク切れ」として出力する
5. 最後に検出件数のサマリーを表示する。0 件の場合は「✅ リンク切れなし」と表示する

### weekly-review-body.md の確認コマンド差し替え

現行のワンライナーを削除し、以下のように差し替える（概念）。

```
python3 .github/workflows/scripts/check-doc-links.py
```

---

## niconico-mylist-assistant/batch のカバレッジ未設定に関する方針

### 問題の構造（再調査）

当初は「バッチパッケージ全般の例外」として整理していたが、レビューを経て以下が明確になった。

- **他のバッチパッケージ（例: stock-tracker/batch）は `coverageThreshold` を設定している**
- niconico-mylist-assistant/batch に限って未設定である
- 根本原因は `src/playwright-automation.ts`（728行）が Playwright (`chromium`, `Browser`, `Page`) を直接 import しており、通常の Jest 単体テストではモック化が困難な構造になっていること
- 現状の単体テストは `constants.ts`, `utils.ts`, `web-push-client.ts` のみをカバーしており、主要ビジネスロジックである `playwright-automation.ts` と `index.ts` がカバレッジ対象から外れている

### 対応方針の選択肢

| アプローチ | 概要 | 特徴 |
| ---------- | ---- | ---- |
| **A: テストディレクトリ構造の整理と Playwright 依存コードの分離** | `src/` を「Playwright 依存層」と「純粋ロジック層」に明確に分割し、純粋ロジック層に対して単体テストとカバレッジ閾値を設定する | 根本解決。設計改善を伴うため工数が大きい |
| **B: 現状維持 + docs への設計判断の明記** | coverageThreshold 未設定の状態を維持しつつ、testing.md にその理由（Playwright 依存構造）を明記する | 暫定対応。将来的に A への移行を検討する余地を残す |

**選択**: まず **B（現状維持 + docs への明記）** を実施し、**A（設計改善）** は別タスクとして扱う。

理由: A は niconico-mylist-assistant/batch の設計全体を見直す大きな変更であり、本タスク（週次ドキュメントレビュー対応）のスコープを超える。

### testing.md への追記方針

`docs/development/testing.md` のカバレッジに関するセクションに、以下の内容を追記する。

- **対象パッケージ**: `services/niconico-mylist-assistant/batch`
- **理由**: コアロジック（`playwright-automation.ts`）が Playwright に直接依存しており、Jest 単体テストでのモック化が困難な構造のため、`coverageThreshold` を設定していない
- **補足**: この状況は一般的な「バッチパッケージはカバレッジ不要」というルールではなく、本パッケージ固有の構造的事情による例外
- **将来方針**: Playwright 依存コードと純粋ロジックを分離してテスタビリティを改善することを検討する（別タスク）
- **記述スタイル**: 既存の表形式または箇条書き形式に揃える

---

## 実装上の注意点

### 依存関係・前提条件

- `.github/workflows/scripts/` ディレクトリが存在しない場合は新規作成する
- Python スクリプトの文字コードは UTF-8 とし、日本語ファイル名・リンクテキストを正しく処理できること
- スクリプトはリポジトリルート（`/`）から実行されることを前提とする

### セキュリティ考慮事項

- スクリプトはファイルシステムの読み取りのみ実施し、書き込み・ネットワーク通信は行わない
- 正規表現パターンは ReDoS（正規表現 DoS）に対して安全な構造とする（バックトラック深度に注意）
- シェルコマンドへの引数渡しは行わず、Python 標準ライブラリのみで実装する

### パフォーマンス考慮事項

- `docs/` のファイル数は数十〜数百程度であり、単純なファイル列挙・正規表現マッチングで十分なパフォーマンスが得られる
- キャッシュ・並列化は不要

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `docs/development/testing.md` に統合すること：
      niconico-mylist-assistant/batch の `coverageThreshold` 未設定の理由（Playwright 直接依存構造による例外）と将来方針を追記する
- [ ] `.github/workflows/templates/weekly-review-body.md` の確認コマンドを修正済みスクリプトの呼び出しに差し替えた後、
      既存の誤ったワンライナーを削除して整合性を保つこと
- [ ] `docs/services/` レベルへの統合は不要（インフラ・プラットフォームタスクのため）
