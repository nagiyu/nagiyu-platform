# Codec Converter 共通UI部品適用 - プロジェクト概要

## 背景

### 現状の問題点

Codec Converterは現在、以下の問題を抱えています：

1. **共通UIライブラリが未使用**
    - `@nagiyu/ui` への依存が `package.json` に含まれていない
    - Material-UI (`@mui/material`) も含まれていない
    - 参照: `services/codec-converter/web/package.json`

2. **レイアウトコンポーネントが未使用**
    - `layout.tsx` で `ThemeRegistry` を使用していない
    - Header、Footerコンポーネントが含まれていない
    - 参照: `services/codec-converter/web/src/app/layout.tsx`

3. **インラインスタイルで実装**
    - 全てのUIが `style` 属性によるインラインスタイルで実装
    - 参照:
        - `services/codec-converter/web/src/app/page.tsx`
        - `services/codec-converter/web/src/app/jobs/[jobId]/page.tsx`

### 他サービスとの比較

プラットフォーム内の他サービスは全て共通UI部品を使用しています：

| サービス | `@nagiyu/ui` 使用 | ThemeRegistry | Header/Footer | Material-UI |
|---------|-------------------|---------------|---------------|-------------|
| Auth | ✅ | ✅ | ✅ | ✅ |
| Admin | ✅ | ✅ | ✅ | ✅ |
| Tools | ✅ | ✅ | ✅ | ✅ |
| **Codec Converter** | ❌ | ❌ | ❌ | ❌ |

参考実装:
- `services/auth/web/package.json` (L28)
- `services/admin/web/package.json` (L26)
- `services/tools/package.json` (L25)

## プロジェクト目標

### 主要目標

1. **統一されたUI/UX**
    - プラットフォーム全体で一貫したデザインシステムを提供
    - ユーザー体験の向上

2. **保守性の向上**
    - 共通コンポーネントの使用によりメンテナンスコストを削減
    - デザイン変更時の影響範囲を最小化

3. **品質保証**
    - E2Eテストを更新し、UI変更後も品質を維持
    - アクセシビリティの向上

### 具体的な成果物

- [ ] `@nagiyu/ui` および Material-UI の導入
- [ ] ThemeRegistry による統一テーマの適用
- [ ] Header/Footer コンポーネントの追加
- [ ] インラインスタイルから Material-UI コンポーネントへの移行
- [ ] E2E テストの更新
- [ ] アクセシビリティ監査の実施
- [ ] 更新されたドキュメント

## スコープ

### 対象ファイル

#### アプリケーションコード
- `services/codec-converter/web/package.json`
- `services/codec-converter/web/src/app/layout.tsx`
- `services/codec-converter/web/src/app/page.tsx`
- `services/codec-converter/web/src/app/jobs/[jobId]/page.tsx`
- `services/codec-converter/web/src/components/ThemeRegistry.tsx` (新規作成)

#### テストコード
- `services/codec-converter/web/tests/integration/scenario-1-happy-path.spec.ts`
- `services/codec-converter/web/tests/integration/scenario-2-file-size-validation.spec.ts`
- `services/codec-converter/web/tests/integration/scenario-3-error-handling.spec.ts`
- `services/codec-converter/web/tests/integration/common-components.spec.ts` (新規作成)
- `services/codec-converter/web/e2e/unit/app/page.test.tsx.skip` (有効化)

#### ドキュメント
- `docs/services/codec-converter/ui-design.md`

### 対象外

以下は本プロジェクトのスコープ外です：

- API エンドポイントの変更
- バックエンドロジックの変更
- バッチ処理の変更
- インフラストラクチャの変更
- 新機能の追加

## フェーズ構成

### Phase 1: 準備・環境整備（1-2日）

**目的**: 開発環境を整え、必要な依存関係を導入

**主要タスク**:
- package.json への依存関係追加
- npm install 実行
- TypeScript 設定の調整
- ビルド確認

**成果物**:
- 更新された package.json
- エラーなくビルドできる環境

**詳細**: [phase-1-setup.md](./phase-1-setup.md)

### Phase 2: 共通レイアウトコンポーネントの導入（2-3日）

**目的**: ThemeRegistry と統一レイアウトを導入

**主要タスク**:
- ThemeRegistry コンポーネントの作成
- layout.tsx の更新
- 動作確認

**成果物**:
- `src/components/ThemeRegistry.tsx`
- 更新された `src/app/layout.tsx`
- Header/Footer が全ページで表示される状態

**詳細**: [phase-2-layout.md](./phase-2-layout.md)

### Phase 3: UIコンポーネントの移行（3-5日）

**目的**: インラインスタイルを Material-UI コンポーネントに置き換え

**主要タスク**:
- トップページ（page.tsx）の Material-UI 化
- ジョブ詳細ページの Material-UI 化
- スタイル調整

**成果物**:
- Material-UI 化された page.tsx
- Material-UI 化された jobs/[jobId]/page.tsx

**詳細**: [phase-3-ui-migration.md](./phase-3-ui-migration.md)

### Phase 4: E2Eテストの更新（2-3日）

**目的**: UI 変更に対応したテストを作成

**主要タスク**:
- 既存テストセレクタの更新
- 新規テストの追加（Header/Footer）
- Visual Regression テストの検討

**成果物**:
- 更新されたテストファイル
- 新規テストファイル
- パスする全 E2E テスト

**詳細**: [phase-4-e2e-tests.md](./phase-4-e2e-tests.md)

### Phase 5: ユニットテストの更新（1-2日）

**目的**: スキップされているテストを有効化し、Material-UI 対応

**主要タスク**:
- `.skip` を削除して有効化
- Testing Library クエリの更新
- テストの実行と修正

**成果物**:
- 有効化されたユニットテスト
- パスする全ユニットテスト

**詳細**: [phase-5-unit-tests.md](./phase-5-unit-tests.md)

### Phase 6: スタイル調整・アクセシビリティ改善（1-2日）

**目的**: レスポンシブ対応とアクセシビリティの確保

**主要タスク**:
- デスクトップ/タブレット/モバイル表示確認
- アクセシビリティ監査（axe-core）
- 改善実施

**成果物**:
- レスポンシブ対応済みUI
- アクセシビリティ基準を満たすUI
- アクセシビリティテスト

**詳細**: [phase-6-styling-a11y.md](./phase-6-styling-a11y.md)

### Phase 7: 統合・検証（1-2日）

**目的**: 全体の動作確認と品質保証

**主要タスク**:
- 全テストの実行
- ビルド確認
- 開発環境での動作確認

**成果物**:
- パスする全テスト
- 正常にビルドできる状態
- 動作確認済みアプリケーション

**詳細**: [phase-7-integration.md](./phase-7-integration.md)

### Phase 8: ドキュメント更新（1日）

**目的**: 変更内容をドキュメントに反映

**主要タスク**:
- UI 設計ドキュメントの更新
- 開発ガイドの更新
- スクリーンショットの更新

**成果物**:
- 更新された docs/services/codec-converter/ui-design.md
- 開発ガイド

**詳細**: [phase-8-documentation.md](./phase-8-documentation.md)

## 推定工数

### 全フェーズ実施

| Phase | 推定工数 | 備考 |
|-------|---------|------|
| Phase 1 | 1-2日 | 環境整備 |
| Phase 2 | 2-3日 | レイアウト導入 |
| Phase 3 | 3-5日 | UI 移行（段階的実施可能） |
| Phase 4 | 2-3日 | E2E テスト |
| Phase 5 | 1-2日 | ユニットテスト |
| Phase 6 | 1-2日 | スタイル・アクセシビリティ |
| Phase 7 | 1-2日 | 統合・検証 |
| Phase 8 | 1日 | ドキュメント |
| **合計** | **12-20日** | |

### 最小構成（MVP）

段階的に実施する場合、以下の最小構成でも一度デプロイ可能です：

| Phase | 推定工数 | 備考 |
|-------|---------|------|
| Phase 1 | 1-2日 | 環境整備 |
| Phase 2 | 2-3日 | レイアウト導入 |
| Phase 3.1 | 2-3日 | トップページのみ |
| Phase 4.1 | 1-2日 | 既存テスト更新のみ |
| **合計** | **6-10日** | |

その後、残りのフェーズを順次実施できます。

## 依存関係

### 前提条件

- Node.js 環境が整っていること
- npm でのパッケージ管理が可能なこと
- Playwright によるE2Eテストが実行可能なこと

### 外部依存

このプロジェクトは以下に依存します：

- `@nagiyu/ui` パッケージ（libs/ui）
- `@nagiyu/browser` パッケージ
- Material-UI v7
- Next.js 16

### フェーズ間の依存関係

```
Phase 1 (準備)
    ↓
Phase 2 (レイアウト)
    ↓
Phase 3 (UI移行) ←→ Phase 4 (E2Eテスト)
    ↓                     ↓
Phase 5 (ユニットテスト)
    ↓
Phase 6 (スタイル・アクセシビリティ)
    ↓
Phase 7 (統合・検証)
    ↓
Phase 8 (ドキュメント)
```

**注**: Phase 3 と Phase 4 は並行して進めることも可能です。

## リスクと対策

### リスク1: E2Eテストの大幅な書き換えが必要

**影響度**: 中
**発生確率**: 高

**対策**:
- data-testid 属性を積極的に使用してセレクタを安定化
- テストヘルパー関数を作成し、セレクタの変更を一箇所に集約
- Phase 4 で詳細なガイドラインを提供

### リスク2: インラインスタイルからMaterial-UIへの移行で見た目が変わる

**影響度**: 中
**発生確率**: 高

**対策**:
- Phase 3 を小さなステップに分割
- 各ステップで視覚的な確認を実施
- 必要に応じてカスタムスタイルで微調整
- スクリーンショット比較ツールの活用を検討

### リスク3: 既存機能への影響

**影響度**: 高
**発生確率**: 低

**対策**:
- 各フェーズでテストを実行
- 機能的な変更は最小限に抑え、UI部品の置き換えのみに集中
- Phase 7 で総合的な動作確認を実施

### リスク4: Material-UI学習コスト

**影響度**: 低
**発生確率**: 中

**対策**:
- 他サービス（Auth, Admin, Tools）の実装を参考にする
- Material-UI 公式ドキュメントを活用
- Phase 3 のドキュメントで具体的な実装例を提供

## 成功基準

このプロジェクトは以下の基準を満たした場合に成功とみなします：

### 必須基準

- [ ] 全ページで Header/Footer が表示される
- [ ] Material-UI コンポーネントが正しく適用されている
- [ ] 全 E2E テストがパスする
- [ ] 全ユニットテストがパスする
- [ ] ビルドエラーがない
- [ ] 既存機能が全て動作する

### 推奨基準

- [ ] アクセシビリティ基準（WCAG 2.1 AA）を満たす
- [ ] レスポンシブデザインが適切に機能する
- [ ] 他サービスと視覚的に統一されている
- [ ] ドキュメントが最新の状態に更新されている

## 次のステップ

1. このドキュメントをレビュー
2. 各フェーズの詳細ドキュメントを作成
3. Issue 作成（`.github/agents/speckit.taskstoissues.agent.md` 使用）
4. Phase 1 から順次実装開始

## 関連リソース

### 既存実装の参考

- Auth サービス: `services/auth/web/`
- Admin サービス: `services/admin/web/`
- Tools サービス: `services/tools/`

### 共通UIライブラリ

- ソースコード: `libs/ui/`
- ドキュメント: `docs/libs/ui.md`

### Material-UI

- 公式ドキュメント: https://mui.com/
- バージョン: 7.x

### テストフレームワーク

- Playwright: https://playwright.dev/
- Testing Library: https://testing-library.com/
