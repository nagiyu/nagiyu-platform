# ToDo の初期表示で一瞬モックデータが表示される問題の修正

## 概要

Share Together にて、リストを選択した時に一瞬モックデータ（「牛乳を買う」「請求書を確認する」等）が表示される問題を修正する。

## 関連情報

-   Issue: #2001
-   関連 Issue: #2002（本タスクドキュメント作成のための Issue）
-   タスクタイプ: サービスタスク（share-together）
-   マイルストーン: v6.0.0

## 調査結果

### 原因

`services/share-together/web/src/components/TodoList.tsx` に `MOCK_TODOS_BY_SCOPE` というモックデータが定義されており、`useState` の初期値として使用されている。

`apiEnabled=true`（本番API利用モード）の場合でも、`useEffect` でAPIレスポンスが返るまでの間は初期値のモックデータが表示されてしまう。

```
初期レンダリング:
  useState 初期値 = MOCK_TODOS_BY_SCOPE[listId] → モックデータが表示される
    ↓（useEffect 実行）
  API fetch → setTodos(apiData) → 実データに置き換わる
```

この「モックデータ表示 → 実データ表示」の切り替えが一瞬のちらつきとして現れる。

### 影響範囲

-   `services/share-together/web/src/components/TodoList.tsx`
    -   `MOCK_TODOS_BY_SCOPE` 定数
    -   `DEFAULT_LIST_ID_BY_SCOPE` 定数
    -   `TodoList` コンポーネント内の `useState` 初期化部分
-   `services/share-together/web/tests/unit/TodoList.test.tsx`
    -   モックデータを前提としたテスト（`apiEnabled=false` のケース）

### 既存のモックデータ利用状況

`apiEnabled=false`（デフォルト）の場合はモックデータが意図的に表示されており、テストコードもそれを前提としている。そのため、**`apiEnabled=true` の場合のみ初期値を空配列にする**対応が適切。

## 要件

### 機能要件

-   FR1: `apiEnabled=true` 時の TodoList 初期表示にモックデータを使用しないこと
-   FR2: `apiEnabled=true` かつ API 取得完了前は、空の状態（空配列 `[]`）を表示すること
-   FR3: `apiEnabled=false` 時はこれまで通りモックデータを表示すること（既存の振る舞いを維持）
-   FR4: API からデータ取得後は、実データを表示すること（既存の振る舞いを維持）

### 非機能要件

-   NFR1: テストカバレッジ 80% 以上を維持すること
-   NFR2: TypeScript strict mode に準拠すること

## 実装のヒント

### 修正箇所

`TodoList.tsx` の `useState` 初期値を `isApiMode` フラグで分岐する。

-   `isApiMode=true` の場合: 初期値を空配列 `[]` にする
-   `isApiMode=false` の場合: 現在と同様にモックデータを初期値にする

注意: `isApiMode` の計算は `useState` より前に行われているため、この分岐は技術的に可能。

### 削除検討

`MOCK_TODOS_BY_SCOPE` と `DEFAULT_LIST_ID_BY_SCOPE` は、将来的に `apiEnabled=false` が不要になれば削除できるが、今回のスコープでは削除しない（既存テストへの影響が大きい）。

## タスク

-   [ ] T001: `TodoList.tsx` の `useState` 初期値を `isApiMode` で分岐するよう修正
-   [ ] T002: `TodoList.test.tsx` に `apiEnabled=true` 時の初期表示テストを追加（空配列であることを確認）
-   [ ] T003: ローカルで動作確認（リスト選択時にモックデータのちらつきが発生しないこと）
-   [ ] T004: 既存テストが引き続き通ることを確認

## 参考ドキュメント

-   [コーディング規約](../docs/development/rules.md)
-   [テスト戦略](../docs/development/testing.md)
-   [アーキテクチャ方針](../docs/development/architecture.md)

## 備考・未決定事項

-   ローディングインジケーターの表示（API 取得中にスピナーを出すか）については今回のスコープ外とする。ただし、空配列表示中にユーザーが混乱しないか確認が必要。
-   `apiEnabled=false` のモックモードをいつ廃止するかは別 Issue で検討する。
