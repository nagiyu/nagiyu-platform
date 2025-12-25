# 共通ライブラリ抽出ロードマップ

## 概要

Toolsサービスから共通ライブラリ（`libs/ui/`, `libs/browser/`, `libs/common/`）を抽出し、プラットフォーム全体で再利用可能な状態にする。

## 背景

- Toolsサービスが最初の実装として完成
- 以下のコンポーネント・ユーティリティが他サービスでも利用可能
  - UI: Header, Footer, ThemeRegistry, theme.ts, MigrationDialog
  - Browser: clipboard操作、localStorage操作
  - Common: 現時点では該当なし（将来的に汎用ユーティリティを追加）
- ドキュメント（`docs/development/shared-libraries.md`）で設計方針は定義済み
- 実装とテストを行い、Toolsサービスから切り出す

## 目標

1. 共通ライブラリパッケージの作成（`@nagiyu/ui`, `@nagiyu/browser`, `@nagiyu/common`）
2. 各ライブラリのテスト整備（ユニットテスト80%カバレッジ）
3. Toolsサービスから共通コードを切り出し、ライブラリ参照に移行
4. 新サービス作成時にライブラリを即座に利用可能な状態にする

## 前提条件

- ✅ 設計ドキュメント整備済み（`docs/development/`配下）
- ✅ Toolsサービス実装完了
- ✅ 共通設定ファイル整備済み（`configs/`配下）
- ⬜ libs/ディレクトリ構造の作成
- ⬜ 各ライブラリのpackage.json、tsconfig.json設定

## 実装フェーズ

### Phase 1: libs/common/ の作成

**目的**: 完全フレームワーク非依存の共通ライブラリを作成

**タスク**:
1. ディレクトリ構造とパッケージ設定の作成
2. 型定義の抽出（将来的に汎用型を追加）
3. テスト環境のセットアップ
4. CI/CD統合

**成果物**:
- `libs/common/package.json`
- `libs/common/tsconfig.json`
- `libs/common/jest.config.ts`
- `libs/common/src/` ディレクトリ
- `libs/common/tests/unit/` ディレクトリ

**完了基準**:
- [x] パッケージビルドが成功
- [x] テストが実行可能
- [x] `npm test` でテストがパス
- [x] CIでテストが実行される

---

### Phase 2: libs/browser/ の作成と抽出

**目的**: ブラウザAPI依存のユーティリティを抽出・テスト

**抽出対象**:
- Clipboard API ラッパー（`services/tools/src/lib/clipboard.ts`）
- localStorage ラッパー（MigrationDialogとtransit-converterから抽出）

**タスク**:
1. ディレクトリ構造とパッケージ設定の作成
2. Clipboard APIラッパーの移行
3. localStorage ラッパーの実装と移行
4. ユニットテストの作成（モック使用）
5. テストカバレッジ80%達成
6. CI/CD統合

**成果物**:
- `libs/browser/package.json`
- `libs/browser/tsconfig.json`
- `libs/browser/jest.config.ts`
- `libs/browser/src/clipboard.ts`
- `libs/browser/src/localStorage.ts`
- `libs/browser/tests/unit/` 配下のテストファイル

**完了基準**:
- [x] パッケージビルドが成功
- [x] 全テストがパス（80%以上カバレッジ）
- [x] Clipboard APIのエラーハンドリングが適切
- [x] localStorage SSR対応（ブラウザ環境チェック）
- [x] CIでテストが実行される

---

### Phase 3: libs/ui/ の作成と抽出

**目的**: Next.js + Material-UI 依存のUIコンポーネントを抽出・テスト

**抽出対象**:
- Header コンポーネント（`services/tools/src/components/layout/Header.tsx`）
- Footer コンポーネント（`services/tools/src/components/layout/Footer.tsx`）
- ThemeRegistry コンポーネント（`services/tools/src/components/ThemeRegistry.tsx`）
- theme.ts（`services/tools/src/styles/theme.ts`）
- MigrationDialog コンポーネント（`services/tools/src/components/dialogs/MigrationDialog.tsx`）

**タスク**:
1. ディレクトリ構造とパッケージ設定の作成
2. theme.ts の移行
3. Header コンポーネントの移行とテスト
4. Footer コンポーネントの移行とテスト
5. ThemeRegistry コンポーネントの移行とテスト
6. MigrationDialog コンポーネントの移行とテスト
7. ユニットテストの作成（Testing Library使用）
8. テストカバレッジ80%達成
9. CI/CD統合

**設計考慮事項**:
- Header: サービス名をpropsで受け取るように汎用化
- Footer: バージョン、利用規約・プライバシーポリシーのダイアログ化
- ThemeRegistry: MigrationDialogの有効/無効を制御可能に
- MigrationDialog: サービス固有のメッセージをpropsで受け取る

**成果物**:
- `libs/ui/package.json`
- `libs/ui/tsconfig.json`
- `libs/ui/jest.config.ts`
- `libs/ui/src/components/layout/Header.tsx`
- `libs/ui/src/components/layout/Footer.tsx`
- `libs/ui/src/components/ThemeRegistry.tsx`
- `libs/ui/src/components/dialogs/MigrationDialog.tsx`
- `libs/ui/src/styles/theme.ts`
- `libs/ui/tests/unit/` 配下のテストファイル

**完了基準**:
- [x] パッケージビルドが成功
- [x] 全コンポーネントのテストがパス（80%以上カバレッジ）
- [x] 各コンポーネントが適切に汎用化されている
- [x] Material-UI依存が適切に管理されている
- [x] CIでテストが実行される

---

### Phase 4: Toolsサービスからの切り出し

**目的**: Toolsサービスを共通ライブラリ参照に移行

**タスク**:
1. Toolsの`package.json`に共通ライブラリ依存を追加
2. clipboard.ts削除 → `@nagiyu/browser`に移行
3. localStorage直接利用削除 → `@nagiyu/browser`に移行
4. Header/Footer/ThemeRegistry/theme.ts削除 → `@nagiyu/ui`に移行
5. MigrationDialog削除 → `@nagiyu/ui`に移行
6. Toolsサービスのテストを更新
7. Toolsサービスの全テストがパス（ユニット + E2E）
8. 動作確認（開発環境デプロイ）

**成果物**:
- 更新された`services/tools/package.json`
- 削除されたファイル群
- 更新されたインポート文
- 更新されたテストファイル

**完了基準**:
- [x] Toolsサービスのビルドが成功
- [x] 全ユニットテストがパス（80%以上カバレッジ）
- [x] 全E2Eテストがパス（3デバイス）
- [x] 開発環境で動作確認完了
- [x] コード重複が完全に排除されている

---

### Phase 5: ドキュメント更新と最終検証

**目的**: ドキュメントを最新状態に更新し、全体を検証

**タスク**:
1. `docs/development/shared-libraries.md`の実装状況を更新
2. 各ライブラリのREADME.md作成（使用方法、API仕様）
3. `docs/development/service-template.md`に共通ライブラリ利用ガイドを追加
4. リポジトリのルートREADME.md更新（libs/構成の説明）
5. 最終的な統合テスト実行
6. 本タスクファイルのステータス更新

**成果物**:
- `libs/ui/README.md`
- `libs/browser/README.md`
- `libs/common/README.md`
- 更新されたドキュメント群

**完了基準**:
- [x] 全ドキュメントが最新状態
- [x] 各ライブラリのREADMEが充実
- [x] 新サービス作成時の利用方法が明確
- [x] 全CIテストがパス

---

## 技術スタック

### libs/common/
- TypeScript 5.x
- Jest (テスト)
- 外部依存なし

### libs/browser/
- TypeScript 5.x
- Jest (テスト)
- ブラウザAPI（navigator.clipboard, localStorage）

### libs/ui/
- TypeScript 5.x
- React 19.x
- Next.js 16.x
- Material-UI 7.x
- Emotion (スタイリング)
- Jest + Testing Library (テスト)

---

## 依存関係ルール

```
libs/ui/ → libs/browser/ → libs/common/
```

- **一方向のみ**: 上位から下位への依存のみ許可
- **循環依存禁止**: 下位ライブラリは上位を参照しない
- **ライブラリ内部は相対パスのみ**: パスエイリアス禁止

---

## テスト戦略

### ユニットテスト
- **カバレッジ目標**: 80%以上
- **フレームワーク**: Jest + Testing Library（UI用）
- **モック**: ブラウザAPI（clipboard, localStorage）をモック化

### CI戦略
- **ci-fast**: 各PR時に全ライブラリのテストを実行
- **ci-full**: develop/masterマージ時にカバレッジチェック

---

## バージョン管理

- **各ライブラリで独立管理**: `@nagiyu/ui`, `@nagiyu/browser`, `@nagiyu/common`
- **セマンティックバージョニング**: 1.0.0から開始
- **初回リリース**: Phase 4完了時に1.0.0としてリリース

---

## リスクと対策

### リスク1: コンポーネントの汎用化が不十分
**対策**: Phase 3で十分な設計レビューを実施。Propsインターフェースを明確に定義。

### リスク2: テストカバレッジ不足
**対策**: 各Phaseで80%カバレッジを完了基準に設定。CIで自動チェック。

### リスク3: Toolsサービスの動作不良
**対策**: Phase 4でE2Eテストを必ず実行。開発環境で十分な動作確認。

### リスク4: ライブラリ間の依存関係違反
**対策**: 各Phaseでビルド・テストを実施。依存関係を明確にドキュメント化。

---

## 参照ドキュメント

- [共通ライブラリ設計](../docs/development/shared-libraries.md)
- [アーキテクチャ方針](../docs/development/architecture.md)
- [テスト戦略](../docs/development/testing.md)
- [サービステンプレート](../docs/development/service-template.md)
- [共通設定ファイル](../docs/development/configs.md)

---

## 次のアクション

1. 本ロードマップのレビュー・承認
2. GitHub Issueの作成（各Phase・各タスク単位）
3. Phase 1から順次実装開始
