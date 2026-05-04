# Visual Regression Tests

Storybook の各 Story を Playwright で開き、スクリーンショット差分を検出するためのディレクトリです。

## 状態

**Phase 0-4 時点では基本構造のみ用意**。本格運用は Phase 1 以降のコンポーネント実装と並行して開始する。

## 想定される使い方

1. `libs/ui` で `npm run build-storybook` を実行（または `storybook dev -p 6006`）
2. Playwright で Storybook の各 Story の `iframe.html?id=...` URL にアクセス
3. `expect(page).toHaveScreenshot()` で前回ベースラインと比較
4. 差分があればテスト失敗、視覚レビューで承認・更新

## 配置例（Phase 1 で導入予定）

```
tests/visual/
├── README.md                  ← 本ファイル
├── playwright.config.ts       ← Playwright 設定（Storybook URL を baseURL に）
└── components/
    └── Button.spec.ts         ← Button の各 Story をスクリーンショット
```

## 関連ドキュメント

- [`docs/development/shared-ui-components.md`](../../../../docs/development/shared-ui-components.md) — 全体方針
- [`docs/development/testing.md`](../../../../docs/development/testing.md) — プラットフォーム共通テスト戦略
