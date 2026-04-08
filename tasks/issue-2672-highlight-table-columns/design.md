# クリップ一覧の列オプショナル化 - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/services/quick-clip/architecture.md に ADR として抽出し、
    tasks/issue-2672-highlight-table-columns/ ディレクトリごと削除します。

    入力: tasks/issue-2672-highlight-table-columns/requirements.md
    次に作成するドキュメント: tasks/issue-2672-highlight-table-columns/tasks.md
-->

## データモデル

### 列設定の型定義（概念レベル）

テーブルの列ごとに「列ID」「表示ラベル」「固定フラグ（常時表示か否か）」「デフォルト表示状態」を持つ定義オブジェクトを用意する。
現在のオプション列は「抽出根拠」1列のみだが、将来の追加を見越してデータ駆動の構造とする。

```
列定義（ColumnDefinition）
  - id: 列を一意に識別するキー
  - label: テーブルヘッダーに表示するラベル文字列
  - fixed: 常時表示で切り替え不可の場合 true
  - defaultVisible: 初回表示時のデフォルト表示状態
```

### localStorage 保存スキーマ（概念レベル）

- キー: `quick-clip:highlight-table-columns`
- 値: オプション列の id をキー、表示状態（boolean）を値とするオブジェクト
- 固定列は保存対象外とする

---

## コンポーネント設計

### パッケージ責務分担

| パッケージ          | 責務                                       |
| ------------------- | ------------------------------------------ |
| `quick-clip/web`    | UI・状態管理・localStorage との読み書き    |
| `quick-clip/core`   | 変更なし（Highlight 型は既存を流用する）   |

### 実装モジュール一覧

**web**

| モジュール                     | パス                                                                           | 役割                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `ColumnVisibilityButton`       | `web/src/components/highlights/ColumnVisibilityButton.tsx`                     | 列設定ボタン + ポップオーバーをまとめたコンポーネント。チェックボックスリストを表示 |
| `useColumnVisibility`          | `web/src/hooks/useColumnVisibility.ts`                                         | 列表示状態の管理・localStorage 同期を担うカスタムフック                           |
| `highlightTableColumns`        | `web/src/constants/highlightTableColumns.ts`                                   | 列定義（ColumnDefinition の配列）を管理する定数モジュール                         |
| `HighlightsPage`（既存・変更） | `web/src/app/jobs/[jobId]/highlights/page.tsx`                                 | `useColumnVisibility` を利用して列の表示 / 非表示を制御する                       |

### モジュール間インターフェース（概念レベル）

**`useColumnVisibility` フック**

- 引数: 列定義の配列（`ColumnDefinition[]`）
- 返り値:
    - 各列の現在の表示状態（id → boolean のマップ）
    - 特定列の表示状態をトグルする関数
- 副作用: 表示状態が変化するたびに localStorage に保存する
- 初期化: localStorage に保存済みの値があればそれを優先し、なければ `defaultVisible` を使用する

**`ColumnVisibilityButton` コンポーネント**

- Props:
    - オプション列の定義（固定列を除いた `ColumnDefinition[]`）
    - 各列の現在の表示状態（id → boolean のマップ）
    - 列の表示状態をトグルするコールバック関数
- 表示: ポップオーバー開閉ボタン + チェックボックスリスト

---

## 実装上の注意点

### 依存関係・前提条件

- `Highlight` 型に `source` 属性（`'motion' | 'volume' | 'both'`）が存在することを前提とする
- 既存の `HIGHLIGHT_SOURCE_LABELS` 定数をそのまま流用できる
- `HighlightsPage` の右パネルテーブルは MUI の `Table` / `TableHead` / `TableCell` を使用しているため、
  同一の MUI コンポーネントで列の条件付きレンダリングを実装する

### パフォーマンス考慮事項

- 列表示の切り替えはクライアント側の状態変更のみであり、API 通信は発生しない
- localStorage の読み書きは初回マウント時と状態変更時のみ行い、ポーリング処理との競合はない

### セキュリティ考慮事項

- localStorage に保存するのは列表示フラグ（boolean）のみであり、機密情報は含まない
- 外部入力をそのまま localStorage から復元する際は、期待する型・値の範囲内であることをバリデーションする

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `docs/services/quick-clip/requirements.md` に統合すること：
      - F-003 の説明文を「各行に抽出根拠（モーション・音量・両方）をオプション列で表示する（デフォルト OFF）」に更新する
      - F-014（列表示設定）・F-015（列設定の永続化）を機能一覧に追記する
- [ ] `docs/services/quick-clip/external-design.md` に統合すること：
      - SCR-003 の「主要 UI 要素」テーブルに「列設定ボタン」を追加する
      - SCR-003 の「ユーザーインタラクション」テーブルに列設定操作を追加する
      - レイアウト図に「列設定」ボタンを追記する
- [ ] `docs/services/quick-clip/architecture.md` に ADR として追記すること（重要な設計決定があれば）：
      - localStorage を使った列設定の永続化方針
