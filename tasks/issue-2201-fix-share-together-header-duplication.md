# Share Together ヘッダー二重表示の修正

## 概要

Share Together のすべてのページでヘッダーが二重に表示される問題を修正する。

原因は以下の二重レンダリング構造にある。

1. `ThemeRegistry` → `ServiceLayout`（`@nagiyu/ui`）→ `Header`（共通ヘッダー）
2. 各ページコンポーネント内で `<Navigation />` を直接レンダリング（独自 `AppBar`）

## 関連情報

- Issue: #2201
- タスクタイプ: サービスタスク
- 対象サービス: `services/share-together/web`

## 調査結果

### 二重レンダリングの構造

```
RootLayout (app/layout.tsx)
  └── ThemeRegistry
        └── ServiceLayout (@nagiyu/ui)
              ├── Header ← 共通ヘッダー（1つ目）
              └── main
                    └── <各ページ>
                          └── <Navigation /> ← 独自ヘッダー（2つ目）
```

### 対象ファイル

独自ヘッダー（`<Navigation />`）を直接レンダリングしているページ:

- `services/share-together/web/src/app/page.tsx`
- `services/share-together/web/src/app/lists/page.tsx`
- `services/share-together/web/src/app/groups/page.tsx`
- `services/share-together/web/src/app/invitations/page.tsx`

独自ヘッダーコンポーネント:

- `services/share-together/web/src/components/Navigation.tsx`

共通レイアウト:

- `services/share-together/web/src/components/ThemeRegistry.tsx`
- `libs/ui/src/components/layout/Header.tsx`（`ServiceLayout` が内部利用）

### Navigation.tsx の機能

`Navigation.tsx` が提供する機能は以下のとおり:

1. "Share Together" タイトル（`/` へのリンク）
2. ナビゲーションリンク（リスト `/lists`、グループ `/groups`）
3. `InvitationBadge`（招待件数バッジ）

### @nagiyu/ui Header の現状

`Header` コンポーネント（`libs/ui`）は以下の props を受け付ける:

- `title` / `href` / `ariaLabel` — タイトル設定
- `navigationItems` — ナビゲーション項目の配列（デスクトップ横並び＋モバイル Drawer 対応）
- `user` / `onLogout` — ユーザー情報・ログアウト

`InvitationBadge` のような任意のアクション要素を挿入するスロットは現時点で存在しない。

## 要件

### 機能要件

- FR1: ヘッダーが1つだけ表示されること
- FR2: ナビゲーションリンク（リスト、グループ）が共通ヘッダーに統合されること
- FR3: `InvitationBadge`（招待件数バッジ）が引き続き表示されること
- FR4: モバイル端末でもナビゲーションが正常に機能すること

### 非機能要件

- NFR1: `@nagiyu/ui` の依存関係ルール（`ui → browser → common`）に違反しないこと
- NFR2: 既存のテストが通ること（テストカバレッジ 80% 以上を維持）
- NFR3: UI 変更が最小限であること

## 実装方針

`ThemeRegistry.tsx` の `ServiceLayout` に `headerSlot={<Navigation />}` を指定することで、
共通ヘッダーの代わりに既存の `Navigation` コンポーネントを使う。
`Navigation.tsx` の改修は不要で、`InvitationBadge` もそのまま表示できる。

変更ファイル:
- `ThemeRegistry.tsx`: `headerSlot={<Navigation />}` を追加
- 各ページ（4 ファイル）: `<Navigation />` のレンダリングを除去

`Navigation.tsx` は `headerSlot` 用コンポーネントとして保持する。

## タスク

- [ ] T001: `services/share-together/web/src/app/page.tsx` から `<Navigation />` を除去
- [ ] T002: `services/share-together/web/src/app/lists/page.tsx` から `<Navigation />` を除去
- [ ] T003: `services/share-together/web/src/app/groups/page.tsx` から `<Navigation />` を除去
- [ ] T004: `services/share-together/web/src/app/invitations/page.tsx` から `<Navigation />` を除去
- [ ] T005: `ThemeRegistry.tsx` に `headerSlot={<Navigation />}` を追加
- [ ] T006: 既存テストの更新（各ページテスト）
- [ ] T007: ビルド・テストの動作確認

## 参考ドキュメント

- `docs/development/rules.md` — コーディング規約
- `docs/development/architecture.md` — アーキテクチャ方針
- `docs/development/shared-libraries.md` — 共通ライブラリの活用方針

## 備考

- 将来的にユーザー情報（ログインユーザー名・ログアウトボタン）を共通ヘッダーに追加する場合は、
  `headerProps` の `user` / `onLogout` を活用する
