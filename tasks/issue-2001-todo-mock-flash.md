# Share Together モックデータ撤廃・API 専用化

## 概要

Share Together にて、リストを選択した時に一瞬モックデータ（「牛乳を買う」「請求書を確認する」等）が表示される問題を修正する。

根本原因はモックデータが残存し、API 呼び出しを制御する `apiEnabled` フラグが引き続き存在することにある。既にモック撤廃の方針がある中で `apiEnabled` フラグを残すことは設計上不整合であるため、**Share Together 全体を見直し、API 経由でのみデータを取得・操作するよう統一する**。

## 関連情報

-   Issue: #2001
-   関連 Issue: #2002（本タスクドキュメント作成のための Issue）
-   タスクタイプ: サービスタスク（share-together）
-   マイルストーン: v6.0.0

## 調査結果

### 問題の背景

`services/share-together/web/src/components/TodoList.tsx` に `MOCK_TODOS_BY_SCOPE` というモックデータが定義されており、`useState` の初期値として使用されている。

`apiEnabled` フラグが `true` の場合でも、`useEffect` で API レスポンスが返るまでの間は初期値のモックデータが表示されてしまう。

```
初期レンダリング:
  useState 初期値 = MOCK_TODOS_BY_SCOPE[listId] → モックデータが表示される
    ↓（useEffect 実行）
  API fetch → setTodos(apiData) → 実データに置き換わる
```

この「モックデータ表示 → 実データ表示」の切り替えが一瞬のちらつきとして現れる。

### `apiEnabled` フラグの現状

`apiEnabled` は Share Together の複数コンポーネントに存在し、`false`（モック）と `true`（API）を切り替えるためのフラグである。しかし、本番環境では常に `true` で動作しており、モックモードは不要な状態となっている。

#### `apiEnabled` 使用箇所

| コンポーネント | 用途 |
|---|---|
| `TodoList.tsx` | Props: `apiEnabled?: boolean`（デフォルト `false`）。`true` の場合のみ各 CRUD 操作で API を呼び出す。`false` の場合はモックデータを使用し、ローカル state のみで操作する。 |
| `ListSidebar.tsx` | Props: `apiEnabled?: boolean`（デフォルト `false`）、`lists?: readonly SidebarList[]`（モック用フォールバックリスト）。`apiEnabled=true` の場合のみ API でリスト一覧取得・作成・編集・削除を行い、`false` の場合は `lists` props のモックデータを表示する。編集/削除ボタンの表示も `apiEnabled` で制御。 |
| `ListWorkspace.tsx` | `ListSidebar` に `apiEnabled={scope === 'personal'}` を渡す。`TodoList` には常に `apiEnabled={true}` を渡す。 |

#### モックデータ

`TodoList.tsx` 内に `MOCK_TODOS_BY_SCOPE`（個人・グループ向けの ToDo サンプル）と `DEFAULT_LIST_ID_BY_SCOPE` が定義されており、`apiEnabled=false` 時の初期値として使用されている。

### 影響を受けるファイル

| ファイル | 変更の種類 |
|---|---|
| `src/components/TodoList.tsx` | `apiEnabled` props・`MOCK_TODOS_BY_SCOPE`・`DEFAULT_LIST_ID_BY_SCOPE`・`isApiMode` 分岐を削除 |
| `src/components/ListSidebar.tsx` | `apiEnabled` props・モックフォールバック分岐を削除 |
| `src/components/ListWorkspace.tsx` | `apiEnabled` props 渡しを削除 |
| `tests/unit/TodoList.test.tsx` | `apiEnabled=false` を前提とするテストを削除し、API 前提のテストに統一 |
| `tests/unit/ListSidebar.test.tsx` | `apiEnabled` を使用しているテストを API 前提に更新 |

## 要件

### 機能要件

-   FR1: `TodoList` コンポーネントから `apiEnabled` props を削除し、常に API 経由で動作させること
-   FR2: `ListSidebar` コンポーネントから `apiEnabled` props を削除し、常に API 経由で動作させること
-   FR3: `TodoList.tsx` の `MOCK_TODOS_BY_SCOPE`・`DEFAULT_LIST_ID_BY_SCOPE` を削除すること
-   FR4: API 取得完了前（ローディング中）は空の状態（空配列 `[]`）を表示すること
-   FR5: API 取得後は実データを表示すること（既存の振る舞いを維持）

### 非機能要件

-   NFR1: テストカバレッジ 80% 以上を維持すること
-   NFR2: TypeScript strict mode に準拠すること
-   NFR3: 既存の API 呼び出しロジック（エンドポイント・エラーハンドリング）を変更しないこと

## 実装のヒント

### 変更方針

各コンポーネントの `apiEnabled` を除去し、API 呼び出しを無条件に実行するよう変更する。

-   `TodoList.tsx`: `isApiMode` ガードを削除し、`listId` が存在する場合は常に API を呼び出す。`MOCK_TODOS_BY_SCOPE`・`DEFAULT_LIST_ID_BY_SCOPE`・`useState` の初期値ロジックを削除し、空配列 `[]` を初期値とする。
-   `ListSidebar.tsx`: `if (!apiEnabled) return;` 等の分岐を削除し、`lists` props（モック用フォールバック）を除去する。表示は常に `apiLists` を使用する。
-   `ListWorkspace.tsx`: `apiEnabled` の props 渡しを削除する。

### テストの更新方針

-   `apiEnabled=false` のモックモードを前提とするテスト（「牛乳を買う」等を直接 `getByText` するテスト）は削除する。
-   API モードを前提とするテスト（`fetch` をモックして実データを確認するテスト）に統一する。
-   `listId` が指定されている場合は常に API が呼ばれることをテストする。

## タスク

-   [ ] T001: `TodoList.tsx` から `apiEnabled` props・`MOCK_TODOS_BY_SCOPE`・`DEFAULT_LIST_ID_BY_SCOPE`・`isApiMode` を削除し、常に API 経由の実装に変更する
-   [ ] T002: `ListSidebar.tsx` から `apiEnabled` props・モックフォールバック分岐を削除し、常に API 経由の実装に変更する
-   [ ] T003: `ListWorkspace.tsx` の `apiEnabled` props 渡しを削除する
-   [ ] T004: `TodoList.test.tsx` のモックデータ前提テストを削除し、API 前提テストに統一する
-   [ ] T005: `ListSidebar.test.tsx` を API 前提テストに更新する
-   [ ] T006: テストカバレッジ 80% 以上を確認する
-   [ ] T007: 既存テストが引き続き通ることを確認する

## 参考ドキュメント

-   [コーディング規約](../docs/development/rules.md)
-   [テスト戦略](../docs/development/testing.md)
-   [アーキテクチャ方針](../docs/development/architecture.md)

## 備考・未決定事項

-   ローディング中に空配列が表示されることによるUX影響（ちらつきや空状態の見た目）は、別途ローディングインジケーター導入を検討する。今回のスコープ外とする。
