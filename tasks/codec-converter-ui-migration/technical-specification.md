# Codec Converter 共通UI部品適用 - 技術仕様

## 目的

このドキュメントは、Codec Converterに共通UI部品を適用する際の**必須技術要件**のみを定義します。

## 基本方針

本プロジェクトは **最小限のルール** を原則とします ([docs/README.md](../../docs/README.md) 参照)。

- 実装の詳細は各サービスの特性に応じて判断
- 必須事項のみを定義
- 参考実装を活用し、車輪の再発明を避ける

## 必須依存関係

### 追加するパッケージ

```json
{
    "dependencies": {
        "@emotion/react": "^11.14.0",
        "@emotion/styled": "^11.14.1",
        "@mui/icons-material": "^7.3.6",
        "@mui/material": "^7.3.6",
        "@mui/material-nextjs": "^7.3.6",
        "@nagiyu/ui": "*",
        "@nagiyu/browser": "*"
    },
    "devDependencies": {
        "@axe-core/playwright": "^4.11.0"
    }
}
```

**参考**: 他サービスの package.json
- `services/auth/web/package.json`
- `services/admin/web/package.json`
- `services/tools/package.json`

## 必須コンポーネント

### ThemeRegistry

**ファイル**: `services/codec-converter/web/src/components/ThemeRegistry.tsx`

**必須要件**:
- `@nagiyu/ui` から `theme`, `Header`, `Footer` をインポート
- Material-UIの `ThemeProvider` でラップ
- Header と Footer を含むレイアウト構造を提供

**参考実装**: `services/auth/web/src/components/ThemeRegistry.tsx`

### layout.tsx の更新

**ファイル**: `services/codec-converter/web/src/app/layout.tsx`

**必須要件**:
- ThemeRegistry で children をラップ
- Viewport metadata を追加（themeColor設定）

**参考実装**: `services/auth/web/src/app/layout.tsx`

## UIコンポーネント移行

### 基本原則

- インラインスタイルを Material-UI コンポーネントに置き換え
- 既存の機能を維持（UI変更のみ、ロジック変更なし）
- 参考実装を活用

### 参考リソース

**他サービスのUI実装**:
- Auth サービス: `services/auth/web/src/app/`
- Admin サービス: `services/admin/web/src/app/`
- Tools サービス: `services/tools/src/app/`

**Material-UI公式ドキュメント**: https://mui.com/material-ui/

**実装方針**:
- 具体的なコンポーネントマッピングは実装時に判断
- 視覚的な統一性を優先
- 段階的な移行を推奨

## テスト要件

### E2Eテスト

**必須対応**:
1. 既存テストのセレクタ更新
2. Header/Footer の表示確認テスト追加

**セレクタ戦略**（優先順位）:
1. Role-based queries (`getByRole`)
2. data-testid 属性
3. Text content

**避けるべき**:
- CSSクラス名セレクタ
- 構造依存セレクタ

**参考**: `services/tools/e2e/homepage.spec.ts` (Header/Footerテスト例)

### ユニットテスト

**必須対応**:
- スキップされているテストの有効化
- Testing Library queries の更新

## アクセシビリティ

**必須要件**:
- ARIA ラベルの適切な設定
- セマンティックHTMLの使用
- キーボードナビゲーション対応

**ツール**: `@axe-core/playwright`

## 参考リソース

### 既存実装

- Auth: `services/auth/web/`
- Admin: `services/admin/web/`
- Tools: `services/tools/`

### 共通ライブラリ

- `libs/ui/` - 共通UIコンポーネント
- `docs/libs/ui.md` - UIライブラリドキュメント（存在する場合）

### 外部ドキュメント

- Material-UI: https://mui.com/material-ui/
- Next.js with Material-UI: https://mui.com/material-ui/integrations/nextjs/
- Testing Library: https://testing-library.com/
- Playwright: https://playwright.dev/
- WCAG 2.1: https://www.w3.org/WAI/WCAG21/quickref/

## 実装ガイドライン

本プロジェクトは **ドキュメント駆動開発** を採用しています。

- 実装前に参考実装を確認
- 不明点は既存コードから学ぶ
- 過度な抽象化を避け、シンプルに実装
- 動作するコードを優先

詳細は以下を参照:
- [コーディング規約](../../docs/development/rules.md)
- [アーキテクチャ方針](../../docs/development/architecture.md)