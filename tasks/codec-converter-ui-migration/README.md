# Codec Converter 共通UI部品適用プロジェクト

## 概要

Codec Converterに共通UI部品（`@nagiyu/ui`）を適用し、プラットフォーム全体で統一されたUI/UXを提供するプロジェクトです。

## 現状の問題

- Codec Converterは共通UIライブラリ（`@nagiyu/ui`）を使用していない
- インラインスタイルで実装されており、他サービス（Auth, Admin, Tools）と見た目が統一されていない
- Header/Footerコンポーネントが存在しない
- Material-UIを使用していない

## 目標

1. 共通UIライブラリ（`@nagiyu/ui`）を導入
2. Material-UIベースのコンポーネントに移行
3. Header/Footerを追加し、プラットフォーム全体で統一感のあるUIを実現
4. E2Eテストを更新し、UI変更後も品質を保証

## プロジェクト構成

このプロジェクトは以下のフェーズで構成されています：

### Phase 1: 準備・環境整備
- 依存関係の追加（`@nagiyu/ui`, `@mui/material` など）
- TypeScript設定の調整

### Phase 2: 共通レイアウトコンポーネントの導入
- ThemeRegistryコンポーネントの作成
- layout.tsxの更新

### Phase 3: UIコンポーネントの移行
- トップページ（page.tsx）のMaterial-UI化
- ジョブ詳細ページのMaterial-UI化

### Phase 4: E2Eテストの更新
- 既存テストセレクタの更新
- 新規テストの追加（Header/Footer確認）

### Phase 5: ユニットテストの更新
- スキップされているテストの有効化
- Material-UIコンポーネント対応

### Phase 6: スタイル調整・アクセシビリティ改善
- レスポンシブ対応の確認
- アクセシビリティ監査

### Phase 7: 統合・検証
- 全テストの実行
- ビルド確認
- 開発環境での動作確認

### Phase 8: ドキュメント更新
- UI設計ドキュメントの更新
- 開発ガイドの更新

## 関連ドキュメント

### プロジェクト全体
- [親タスク概要](./overview.md) - プロジェクト全体の詳細説明
- [技術仕様](./technical-specification.md) - 技術仕様とアーキテクチャガイド
- [E2Eテスト更新ガイド](./e2e-testing-guide.md) - E2Eテスト更新の詳細ガイドライン

### 個別フェーズドキュメント
- [Phase 1: 準備・環境整備](./phase-1-setup.md)
- [Phase 2: 共通レイアウト導入](./phase-2-layout.md)
- [Phase 3: UIコンポーネント移行](./phase-3-ui-migration.md)
- [Phase 4: E2Eテスト更新](./phase-4-e2e-tests.md)
- [Phase 5: ユニットテスト更新](./phase-5-unit-tests.md)
- [Phase 6: スタイル・アクセシビリティ](./phase-6-styling-a11y.md)
- [Phase 7: 統合・検証](./phase-7-integration.md)
- [Phase 8: ドキュメント更新](./phase-8-documentation.md)

### 既存サービスドキュメント
- `docs/services/codec-converter/` - Codec Converter既存ドキュメント
- `docs/libs/ui.md` - 共通UIライブラリ仕様

### 参考実装
- `services/auth/web/` - Auth サービス（共通UI使用例）
- `services/admin/web/` - Admin サービス（共通UI使用例）
- `services/tools/` - Tools サービス（共通UI使用例）

## タスク追跡

各フェーズの詳細なタスクは、個別のフェーズドキュメントを参照してください。

## Issue作成について

このプロジェクトのIssueは `.github/agents/speckit.taskstoissues.agent.md` エージェントによって作成されます。

各フェーズドキュメントには、エージェントがIssue作成時に参照すべき情報が含まれています：
- タスクの詳細説明
- 受け入れ基準
- 実装の前提条件
- 関連ファイル
- テスト要件

## 進め方

1. 各フェーズは順番に実施することを推奨
2. Phase 1-2完了後、Phase 3で段階的に実装可能
3. 最小構成（MVP）として Phase 1-3.1-4.1 のみ実施も可能
4. E2Eテストは各UI変更と同時に更新することを推奨

## 推定工数

- 全フェーズ実施: 12-20日
- MVP（最小構成）: 6-10日

詳細は [overview.md](./overview.md) を参照してください。
