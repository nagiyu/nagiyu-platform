# Share Together ヘッダー二重表示の修正

## 概要

Share Together のすべてのページでヘッダーが二重に表示される問題を修正する。
`ServiceLayout` が提供するヘッダーと、各ページで使用されているカスタム `Navigation` コンポーネントが
共存しているため、`AppBar` が2つ同時にレンダリングされている。

## 関連情報

-   Issue: #2201
-   タスクタイプ: サービスタスク（share-together）

## 調査結果

### 原因

`RootLayout` → `ThemeRegistry` → `ServiceLayout` の構成により、
`@nagiyu/ui` の `Header` コンポーネントがルートレイアウトで一度レンダリングされる。

一方、各ページ（`page.tsx`, `lists/page.tsx`, `groups/page.tsx`, `invitations/page.tsx`）
にも独自の `Navigation` コンポーネントが配置されており、こちらも `AppBar` をレンダリングしている。

### 現状の構造

```
RootLayout (app/layout.tsx)
  └─ ThemeRegistry
       └─ ServiceLayout (@nagiyu/ui)
            ├─ Header ← ①  title のみ、ナビゲーションなし
            ├─ {children}
            │    └─ 各ページ
            │         ├─ Navigation ← ②  リスト/グループ + InvitationBadge
            │         └─ ページコンテンツ
            └─ Footer
```

### 各ファイルの役割

| ファイル | 役割 |
|---|---|
| `src/components/ThemeRegistry.tsx` | `ServiceLayout` でラップ。`headerProps` にナビゲーション未設定 |
| `src/components/Navigation.tsx` | カスタム AppBar。「リスト」「グループ」リンクと `InvitationBadge` を含む |
| `src/app/page.tsx` | `<Navigation />` を直接レンダリング |
| `src/app/lists/page.tsx` | `<Navigation />` を直接レンダリング |
| `src/app/groups/page.tsx` | `<Navigation />` を直接レンダリング |
| `src/app/invitations/page.tsx` | `<Navigation />` を直接レンダリング |

## 要件

### 機能要件

-   FR1: ページにヘッダーが1つだけ表示されること
-   FR2: ナビゲーション（「リスト」「グループ」リンク）がヘッダーに表示されること
-   FR3: 「招待」バッジ（`InvitationBadge`）がヘッダーに表示されること

### 非機能要件

-   NFR1: `ServiceLayout` の `headerSlot` を活用し、共通レイアウトの仕組みを維持すること
-   NFR2: テストカバレッジ 80% 以上を維持すること

## 対応方針

`ServiceLayout` の `headerSlot` prop を利用して `Navigation` コンポーネントをルートレイアウト
（`ThemeRegistry`）レベルで一度だけレンダリングするよう修正する。
各ページからは `<Navigation />` の呼び出しをすべて削除する。

この方針を選ぶ理由:

-   `Navigation` には `InvitationBadge` など Share Together 固有のロジックが含まれており、
    `@nagiyu/ui` の `Header` コンポーネントへ機能を移植するよりも変更量が少ない
-   `ServiceLayout` はすでに `headerSlot` をサポートしており、追加のライブラリ変更が不要
-   ルートレイアウトで1回レンダリングすることで、ページ遷移時のちらつきも防止できる

## タスク

-   [ ] T001: `ThemeRegistry.tsx` を修正し、`ServiceLayout` に `headerSlot={<Navigation />}` を渡す
-   [ ] T002: `app/page.tsx` から `<Navigation />` の呼び出しと import を削除する
-   [ ] T003: `app/lists/page.tsx` から `<Navigation />` の呼び出しと import を削除する
-   [ ] T004: `app/groups/page.tsx` から `<Navigation />` の呼び出しと import を削除する
-   [ ] T005: `app/invitations/page.tsx` から `<Navigation />` の呼び出しと import を削除する
-   [ ] T006: 動作確認（各ページでヘッダーが1つだけ表示されること）
-   [ ] T007: ユニットテスト・E2E テストが通ることを確認する

## 参考ドキュメント

-   [コーディング規約](../docs/development/rules.md)
-   [アーキテクチャ方針](../docs/development/architecture.md)
-   [テスト戦略](../docs/development/testing.md)
