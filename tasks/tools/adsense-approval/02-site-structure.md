# タスク: サイト構造の改善

## 概要

グローバルヘッダーとフッターを追加し、サイトのナビゲーション構造を改善する。

## 関連ドキュメント

- **親タスク**: [README.md](./README.md)
- **前提タスク**: [01-required-pages.md](./01-required-pages.md) - 必須ページが作成済みであること
- **サービスドキュメント**:
  - [docs/services/tools/README.md](../../../docs/services/tools/README.md)
  - [docs/services/tools/requirements.md](../../../docs/services/tools/requirements.md)
  - [docs/services/tools/architecture.md](../../../docs/services/tools/architecture.md)

## 背景

現在、Tools サービスにはグローバルヘッダーとフッターがなく、ページ間の移動が困難。Google AdSense の審査では、サイトのナビゲーション構造が重要視される。

## 実装内容

### 1. グローバルヘッダーコンポーネント

**ファイルパス**: `services/tools/src/components/layout/Header.tsx`

**要件**:
- アプリ名「Tools」をロゴとして表示
- トップページへのリンク
- レスポンシブ対応（モバイル時はハンバーガーメニュー）
- Material-UI の `AppBar` コンポーネントを使用

**ナビゲーション項目**:
- ホーム (`/`)
- About (`/about`)

**UI 仕様**:
```typescript
- デスクトップ: 横並びメニュー
- モバイル: ハンバーガーメニュー（Drawer コンポーネント）
```

### 2. グローバルフッターコンポーネント

**ファイルパス**: `services/tools/src/components/layout/Footer.tsx`

**要件**:
- アプリケーションバージョン表示
- 重要なリンク
  - プライバシーポリシー (`/privacy`)
  - 利用規約 (`/terms`)
  - お問い合わせ (`/contact`)
- 著作権表示
- Material-UI の `Box`, `Container`, `Link` を使用

**UI 仕様**:
```typescript
- 中央揃え
- リンクは横並び（モバイルでは縦並び）
- 背景色: theme.palette.background.paper
- テキスト色: theme.palette.text.secondary
```

### 3. レイアウトへの統合

**ファイルパス**: `services/tools/src/app/layout.tsx`

**変更内容**:
- `Header` コンポーネントを `<body>` の先頭に追加
- `Footer` コンポーネントを `<body>` の末尾に追加
- メインコンテンツエリアに適切なパディングを追加

**実装例**:
```typescript
<body>
  <ThemeRegistry version={version}>
    <Header />
    <Box component="main" sx={{ minHeight: 'calc(100vh - 64px - 80px)', py: 2 }}>
      {children}
    </Box>
    <Footer version={version} />
  </ThemeRegistry>
</body>
```

### 4. ナビゲーションの改善

**トップページの改善** (`services/tools/src/app/page.tsx`):
- ヘッダーが追加されたため、ページタイトルの配置を調整
- 「ツール一覧」の見出しはそのまま維持

## ファイル構成

```
services/tools/src/
├── components/
│   └── layout/
│       ├── Header.tsx
│       └── Footer.tsx
└── app/
    └── layout.tsx (変更)
```

## 実装方針

### Material-UI コンポーネント

- `AppBar`: ヘッダー
- `Toolbar`: ヘッダー内のコンテンツ配置
- `Drawer`: モバイルメニュー
- `Box`: フッターとメインコンテンツ
- `Container`: コンテンツの幅制限
- `Link`: ナビゲーションリンク

### レスポンシブ対応

```typescript
// ヘッダー
- デスクトップ (md以上): 横並びメニュー
- モバイル (sm以下): ハンバーガーメニュー

// フッター
- デスクトップ: 横並びリンク
- モバイル: 縦並びリンク
```

### アクセシビリティ

- 適切な `aria-label` の設定
- キーボードナビゲーション対応
- スクリーンリーダー対応

## 受入基準

- [ ] グローバルヘッダーがすべてのページに表示される
- [ ] グローバルフッターがすべてのページに表示される
- [ ] ヘッダーからホーム、About にナビゲーションできる
- [ ] フッターからプライバシーポリシー、利用規約、お問い合わせにナビゲーションできる
- [ ] モバイル表示でハンバーガーメニューが正しく動作する
- [ ] レスポンシブ対応が正しく機能する
- [ ] アクセシビリティ要件を満たす（WCAG 2.1 Level AA）

## テスト要件

### E2E テスト

**ファイルパス**: `services/tools/e2e/navigation.spec.ts`

- ヘッダーの表示確認
- フッターの表示確認
- ナビゲーションリンクの動作確認
- モバイル表示でのハンバーガーメニュー動作確認

## 注意事項

- 既存のページレイアウトを壊さないように注意
- パフォーマンスへの影響を最小限に
- Material-UI のテーマと一貫性のあるデザイン

## 完了後のアクション

- サイトマップの更新（タスク: 04-seo-optimization.md）
