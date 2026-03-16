# Share Together ヘッダー二重表示の修正

## 概要

Share Together のホームページでヘッダーが二重に表示される問題を修正する。
`ThemeRegistry` が `ServiceLayout`（内部にヘッダーを持つ）でアプリ全体をラップしているにもかかわらず、
ホームページ（`page.tsx`）が独自の `Navigation` コンポーネント（AppBar）を追加でレンダリングしているために発生する。

## 関連情報

- Issue: #2201
- タスクタイプ: サービスタスク
- 対象サービス: share-together/web
- マイルストーン: v6.3.0
- ラベル: share-together

## 根本原因

現在の実装では以下の2つのヘッダーが共存している。

1. **グローバルヘッダー**（`ServiceLayout` 経由）
    - `src/app/layout.tsx` → `ThemeRegistry` → `ServiceLayout` → `Header`
    - `headerProps={{ title: 'Share Together', ariaLabel: '...' }}` のみ設定
    - ナビゲーション項目なし
2. **ローカルヘッダー**（`Navigation` コンポーネント）
    - `src/app/page.tsx` で `<Navigation />` を直接レンダリング
    - Material-UI の `AppBar` をベースにした独自実装
    - "リスト"・"グループ" へのナビゲーションリンクと `InvitationBadge` を含む

ホームページにアクセスすると、両方のヘッダーが縦に並んで表示される。

## 要件

### 機能要件

- FR1: ヘッダーの二重表示を解消し、全ページで統一されたヘッダーを1つのみ表示する
- FR2: "リスト"・"グループ" へのナビゲーションリンクを全ページで利用可能にする
- FR3: `InvitationBadge`（招待数バッジ）をヘッダー内に引き続き表示する
- FR4: ホームページ以外のページ（lists, groups, invitations）でも同じナビゲーションを使用する

### 非機能要件

- NFR1: 他のサービス（niconico-mylist-assistant 等）と同じ実装パターンを踏襲する
- NFR2: テストカバレッジ 80% 以上を維持する
- NFR3: 既存の `Navigation.test.tsx` が引き続きパスすること

## 実装のヒント

### 推奨アプローチ: `headerSlot` パターン（niconico と同じ）

niconico-mylist-assistant が同様の問題を解決している方法を参考にする。

- `ThemeRegistry.tsx` で `ServiceLayout` の `headerProps` を `headerSlot` に変更し、
  `Navigation` コンポーネントを `headerSlot` として渡す
- `page.tsx` から `<Navigation />` の直接レンダリングを削除する

変更後のイメージ:

```
ThemeRegistry（headerSlot={<Navigation />}）
  └── ServiceLayout
        ├── Navigation（headerSlot として配置）← ここだけにヘッダーが来る
        ├── children（page.tsx の内容）
        └── Footer
```

### 代替アプローチ（参考）

Stock Tracker のように `NavigationItem` 配列を `headerProps.navigationItems` に渡すことも可能。
ただし `InvitationBadge` のような動的な React コンポーネントをヘッダー内に組み込む場合、
`headerSlot` パターンの方がシンプルで柔軟性が高い。

### `InvitationBadge` の扱い

`Navigation` コンポーネントは `InvitationBadge` を含んでいる。
`headerSlot` パターンでは `Navigation` コンポーネントをそのまま流用できるため、
`InvitationBadge` の動作に変更は不要。

## タスク

- [ ] T001: `services/share-together/web/src/components/ThemeRegistry.tsx` を修正
    - `headerProps` の指定を削除し、`headerSlot={<Navigation />}` に変更する
    - `Navigation` コンポーネントを `@/components/Navigation` からインポートする
- [ ] T002: `services/share-together/web/src/app/page.tsx` を修正
    - `<Navigation />` の直接レンダリングを削除する
    - `Navigation` コンポーネントのインポートを削除する
- [ ] T003: 既存ユニットテスト `tests/unit/Navigation.test.tsx` がパスすることを確認する
- [ ] T004: テストカバレッジを確認する（`npm run test --workspace=@nagiyu/share-together-web`）
    - カバレッジ 80% 以上を維持していることを確認する
- [ ] T005: ビルドが成功することを確認する（`npm run build --workspace=@nagiyu/share-together-web`）
- [ ] T006: E2E テストで全ページ（home / lists / groups / invitations）においてヘッダーが1つのみ表示され、ナビゲーションが正常に機能することを確認する

## 参考ドキュメント

- `docs/services/` - サービスドキュメント
- `docs/development/architecture.md` - レイヤー設計の方針
- `docs/development/rules.md` - コーディング規約
- `libs/ui/src/components/layout/ServiceLayout.tsx` - `ServiceLayout` の `headerSlot` 仕様
- `services/niconico-mylist-assistant/web/src/components/ThemeRegistry.tsx` - 同パターンの参考実装

## 備考・未決定事項

- `Navigation` コンポーネントは現在 `page.tsx` のみで使用されているが、修正後は `ThemeRegistry` 経由で全ページに表示される。既存の lists / groups / invitations ページのレイアウトへの影響を目視確認すること。
- E2E テスト（Playwright）で各ページ（home / lists / groups / invitations）のヘッダー表示と遷移動作を自動検証することが望ましい。既存の E2E テストスイートにヘッダー表示の検証ケースが存在しない場合は追加を検討する。
- `Navigation` コンポーネントのユニットテスト（`Navigation.test.tsx`）は引き続き維持する。
