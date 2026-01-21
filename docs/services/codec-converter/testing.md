# Codec Converter テスト仕様書

---

## 1. テスト戦略概要

### 1.1 テストの目的

Codec Converterサービスの品質を保証し、以下を実現します:

- 動画変換処理の正確性を保証
- ユーザー操作フローの動作確認
- リグレッション防止
- 継続的な品質維持

### 1.2 テスト方針

- **PCターゲット**: Codec Converterは大容量ファイルを扱うため、PC環境を優先
- **カバレッジ重視**: ビジネスロジック（`lib/`）は80%以上のカバレッジを確保
- **自動化**: CI/CDパイプラインで自動テストを実行
- **E2Eでクリティカルパスをカバー**: 主要な変換フローを重点的にテスト

---

## 2. テストデバイス/ブラウザ構成

### 2.1 Playwright デバイス構成

Codec Converterは**PCターゲット**のサービスです。

| デバイス名       | 用途               | 画面サイズ  | User Agent          |
| ---------------- | ------------------ | ----------- | ------------------- |
| chromium-desktop | デスクトップChrome | 1920x1080   | Chrome (最新安定版) |

**注**: 本プラットフォームの標準テスト戦略ではスマホファースト（chromium-mobile優先）を推奨していますが、Codec Converterは大容量ファイルを扱うサービス特性上、PC環境のみを対象とします。

### 2.2 テスト優先順位

#### Fast CI (高速フィードバック)

- **対象**: chromium-desktop のみ
- **目的**: 開発中の素早いフィードバック
- **トリガー**: `integration/codec-converter` ブランチへのPR

#### Full CI (完全テスト)

- **対象**: chromium-desktop のみ
- **目的**: マージ前の完全な品質検証
- **トリガー**: `develop` ブランチへのPR

---

## 3. カバレッジ目標

### 3.1 カバレッジ目標値

| カテゴリ                | カバレッジ目標     | 測定方法      |
| ----------------------- | ------------------ | ------------- |
| ビジネスロジック (lib/) | 80%以上            | Jest coverage |
| ユーティリティ関数      | 80%以上            | Jest coverage |
| UI コンポーネント       | 任意 (E2Eでカバー) | E2E テスト    |
| API Routes              | 任意 (E2Eでカバー) | E2E テスト    |

### 3.2 カバレッジ対象外

以下は Jest のカバレッジ対象外とします（E2E テストでカバー）:

- `app/**/page.tsx` - Next.js App Router の page コンポーネント
- `app/**/layout.tsx` - レイアウトコンポーネント
- `components/ThemeRegistry.tsx` - MUIテーマ設定（UI層）

### 3.3 カバレッジ計測方法

```bash
# カバレッジレポート生成
npm run test:coverage -w services/codec-converter

# カバレッジ結果の確認
# - コンソール出力: サマリー
# - coverage/lcov-report/index.html: 詳細レポート
```

**カバレッジチェック**: Full CI（`develop` へのPR）では、80%未満の場合にビルドが失敗します（`coverageThreshold` 設定により自動チェック）。

---

## 4. E2Eテストシナリオ

### 4.1 テストシナリオ一覧

| シナリオID | シナリオ名                           | 概要                                         | 優先度 | 対象デバイス     |
| ---------- | ------------------------------------ | -------------------------------------------- | ------ | ---------------- |
| E2E-001    | 正常系（H.264変換）                  | アップロード → 変換 → ダウンロード          | 高     | chromium-desktop |
| E2E-002    | エラーハンドリング（ファイルサイズ） | 500MB超のファイルのバリデーションエラー      | 高     | chromium-desktop |
| E2E-003    | エラーハンドリング（不正な形式）     | MP4以外のファイルのバリデーションエラー      | 高     | chromium-desktop |

### 4.2 シナリオ詳細

#### E2E-001: 正常系（H.264変換）

**目的**: 基本的な変換フローが正常に動作することを確認

**前提条件**:

- Next.js開発サーバーが起動している、またはPlaywright設定でwebServerが有効
- AWS環境が設定されている（dev環境）

**テスト手順**:

1. トップ画面にアクセス
2. 50MBのMP4ファイルをドラッグ&ドロップ
3. 出力コーデック「H.264」を選択
4. 「変換開始」ボタンをクリック
5. ジョブ詳細画面に遷移し、ジョブIDが表示される
6. ステータスが「PENDING」と表示される
7. 「ステータス確認」ボタンをクリック
8. Batch Workerが起動後、ステータスが「PROCESSING」に変わる
9. 変換完了後、ステータスが「COMPLETED」に変わる
10. 「ダウンロード」ボタンが表示される
11. ダウンロードボタンをクリックし、ファイルがダウンロードされる

**期待結果**:

- ジョブIDが表示される
- ステータスが PENDING → PROCESSING → COMPLETED と遷移する
- ダウンロードボタンがクリック可能になる
- ファイルがダウンロードできる

**テストファイル**: `tests/e2e/scenario-1-happy-path.spec.ts`

**実行環境要件**:

- AWS環境が必要（S3、DynamoDB、Batch）
- 開発用IAM認証情報

---

#### E2E-002: エラーハンドリング（ファイルサイズ超過）

**目的**: 500MB超のファイルがクライアント側で適切にバリデーションされることを確認

**前提条件**:

- Next.js開発サーバーが起動している、またはPlaywright設定でwebServerが有効

**テスト手順**:

1. トップ画面にアクセス
2. 600MBのMP4ファイルを選択
3. エラーメッセージが表示される
4. 「変換開始」ボタンが非活性のまま

**期待結果**:

- エラーメッセージ「ファイルサイズは500MB以下である必要があります」が表示される
- アップロードが実行されない

**テストファイル**: `tests/e2e/scenario-2-file-size-validation.spec.ts`

**実行環境要件**:

- AWS環境は不要（クライアント側バリデーションのみ）

---

#### E2E-003: エラーハンドリング（不正なファイル形式）

**目的**: MP4以外のファイルが適切にバリデーションされることを確認

**前提条件**:

- Next.js開発サーバーが起動している、またはPlaywright設定でwebServerが有効

**テスト手順**:

1. トップ画面にアクセス
2. MP4以外のファイル（例: test.txt）を選択
3. エラーメッセージが表示される
4. 「変換開始」ボタンが非活性のまま

**期待結果**:

- エラーメッセージ「MP4ファイルのみアップロード可能です」が表示される
- アップロードが実行されない

**テストファイル**: `tests/e2e/scenario-3-error-handling.spec.ts`

**実行環境要件**:

- AWS環境は不要（クライアント側バリデーションのみ）

---

## 5. ユニットテスト対象

### 5.1 テスト対象の分類

#### ビジネスロジック (lib/)

- **バリデーション関数** (`lib/validation/`)
    - `validateFileSize()`: ファイルサイズ検証
    - `validateMimeType()`: MIMEタイプ検証
    - `validateFileExtension()`: 拡張子検証
    - `validateFile()`: 統合バリデーション

- **AWS SDK ラッパー関数** (`lib/aws/`)
    - S3 Presigned URL生成
    - DynamoDB CRUD操作
    - Batchジョブ投入

- **エラーハンドリング関数** (`lib/errors/`)
    - エラーメッセージ定数
    - エラーレスポンス生成

#### 共通ライブラリ (`services/codec-converter-common/`)

- **型定義**: Job、JobStatus、CodecType
- **定数**: MAX_FILE_SIZE、ALLOWED_MIME_TYPES など
- **バリデーション関数**: 共通バリデーションロジック

#### Batch Worker

- **FFmpeg実行ロジック** (`workers/codec-converter-ffmpeg/src/`)
    - コーデック別変換コマンド生成
    - FFmpeg進捗パース
    - エラーハンドリング

### 5.2 テスト対象外

以下はユニットテストの対象外とします:

- ❌ `app/**/page.tsx` - Next.js App Router の page コンポーネント（E2Eでカバー）
- ❌ `app/**/layout.tsx` - レイアウトコンポーネント（E2Eでカバー）
- ❌ `components/ThemeRegistry.tsx` - MUIテーマ設定（UI層、E2Eでカバー）
- ❌ シンプルな型定義のみのファイル - テストする価値が低い

---

## 6. テスト実行方法

### 6.1 ローカル環境での実行

#### ユニットテスト

```bash
# すべてのユニットテストを実行
npm run test -w services/codec-converter

# ウォッチモード（ファイル変更時に自動実行）
npm run test:watch -w services/codec-converter

# カバレッジレポート生成
npm run test:coverage -w services/codec-converter

# 特定のテストファイルのみ実行
npm run test -w services/codec-converter -- tests/unit/validation.test.ts
```

#### E2Eテスト

```bash
# すべての E2E テストを実行
npm run test:e2e -w services/codec-converter

# 特定のデバイスのみ実行
npm run test:e2e -w services/codec-converter -- --project=chromium-desktop

# 特定のテストファイルのみ実行
npm run test:e2e -w services/codec-converter -- tests/e2e/scenario-1-happy-path.spec.ts

# UI モードで実行（デバッグ用）
npm run test:e2e:ui -w services/codec-converter

# ブラウザ表示モード（headed モード）
npm run test:e2e:headed -w services/codec-converter
```

### 6.2 CI環境での実行

#### GitHub Actions

GitHub Actions で自動実行されます:

**Fast CI** (`.github/workflows/codec-converter-verify-fast.yml`):

- トリガー: `integration/codec-converter` ブランチへのPR
- テスト: ビルド、ユニットテスト、E2E (chromium-desktop)

**Full CI** (`.github/workflows/codec-converter-verify-full.yml`):

- トリガー: `develop` ブランチへのPR
- テスト: ビルド、ユニットテスト、カバレッジチェック (80%以上)、E2E (chromium-desktop)
- カバレッジ: 80%未満で失敗

#### 環境変数

CI 環境で必要な環境変数:

```bash
BASE_URL=https://dev-codec-converter.nagiyu.com
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<開発用IAMユーザーのアクセスキー>
AWS_SECRET_ACCESS_KEY=<開発用IAMユーザーのシークレットキー>
```

---

## 7. CI/CD統合

### 7.1 ワークフロー構成

| ワークフロー                 | トリガー                          | 実行内容                                     |
| ---------------------------- | --------------------------------- | -------------------------------------------- |
| codec-converter-verify-fast  | PR to `integration/codec-converter` | ビルド、ユニット、E2E (chromium-desktop)      |
| codec-converter-verify-full  | PR to `develop`                   | ビルド、ユニット、カバレッジ、E2E (chromium-desktop) |
| codec-converter-deploy       | Push to `develop` or `master`     | デプロイ（テストは verify で完了済み）       |

### 7.2 ブランチ保護ルール

#### `integration/codec-converter` ブランチ

- ✅ PR 必須（直接プッシュ禁止）
- ✅ `codec-converter-verify-fast` ワークフローの成功が必須

#### `develop` ブランチ

- ✅ PR 必須（直接プッシュ禁止）
- ✅ `codec-converter-verify-full` ワークフローの成功が必須
- ✅ カバレッジ 80%以上の確保（Jest の `coverageThreshold` により自動チェック）

#### `master` ブランチ

- ✅ PR 必須（直接プッシュ禁止）
- ✅ 全ての CI/CD チェックの成功が必須
- ✅ レビュー承認が必須（推奨）

### 7.3 テスト失敗時の対応

#### ユニットテスト失敗

1. ローカルで再現確認
2. 該当テストを修正
3. カバレッジを再確認

#### E2Eテスト失敗

1. GitHub Actions のアーティファクトを確認（スクリーンショット、動画、トレース）
2. ローカルで再現確認（`npm run test:e2e:ui`）
3. 不安定なテストの場合はリトライ設定を追加

#### カバレッジ不足

1. カバレッジレポートを確認（`coverage/lcov-report/index.html`）
2. カバーされていないコードを特定
3. 必要なテストを追加

---

## 8. 既知の問題・制約

### 8.1 技術的制約

#### AWS環境依存のE2Eテスト

**問題内容**: E2E-001（正常系）は実際のAWS環境（S3、DynamoDB、Batch）が必要

**影響範囲**: シナリオ1のE2Eテスト

**回避策**: 
- ローカル開発では、E2E-002およびE2E-003のみを実行（クライアント側バリデーションのテスト）
- CI環境では開発用IAM認証情報を使用してAWS環境にアクセス

**将来の対応**: localstackやモック環境の検討（Phase 2以降）

---

## 9. テスト作成ガイドライン

### 9.1 ユニットテスト作成ガイドライン

#### 原則

- **純粋関数を優先**: 副作用のないテストしやすいコード
- **一つのテストで一つの検証**: テストケースを小さく保つ
- **AAA パターン**: Arrange（準備）、Act（実行）、Assert（検証）

#### 命名規則

```typescript
describe('バリデーション関数', () => {
    describe('validateFileSize', () => {
        it('正常系: 500MB以下のファイルは検証に成功する', () => {
            // Arrange
            const fileSize = 100 * 1024 * 1024; // 100MB

            // Act
            const result = validateFileSize(fileSize);

            // Assert
            expect(result.isValid).toBe(true);
        });

        it('異常系: 500MB超のファイルは検証に失敗する', () => {
            // Arrange
            const fileSize = 600 * 1024 * 1024; // 600MB

            // Act
            const result = validateFileSize(fileSize);

            // Assert
            expect(result.isValid).toBe(false);
            expect(result.errorMessage).toBe('ファイルサイズは500MB以下である必要があります');
        });

        it('エッジケース: ちょうど500MBのファイルは検証に成功する', () => {
            // Arrange
            const fileSize = 500 * 1024 * 1024; // 500MB

            // Act
            const result = validateFileSize(fileSize);

            // Assert
            expect(result.isValid).toBe(true);
        });
    });
});
```

#### モック対象

以下のような副作用がある処理のみモック化:

- AWS SDK (S3, DynamoDB, Batch)
- FFmpeg実行
- Next.js ルーティング（useRouter 等）
- 外部API呼び出し

### 9.2 E2Eテスト作成ガイドライン

#### 原則

- **ユーザー視点**: 実際の利用シナリオに沿って記述
- **安定性優先**: 不安定なテストは修正するか削除
- **独立性**: テスト間で状態を共有しない

#### テスト粒度

- 主要フローは細かくテスト
- 枝葉の機能は重要度に応じて判断
- 過度に細かいテストは避ける（メンテナンスコスト増）

---

## 10. トラブルシューティング

### 10.1 よくある問題

#### Playwrightブラウザがインストールされていない

**症状**: `Executable doesn't exist` エラー

**原因**: Playwrightのブラウザバイナリがインストールされていない

**解決方法**:
```bash
npx playwright install chromium
```

#### タイムアウトエラーが発生する

**症状**: E2E-001（正常系）でタイムアウトエラー

**原因**: 変換処理に時間がかかる場合がある

**解決方法**: `playwright.config.ts` のタイムアウト設定を調整

#### AWS環境が利用できない

**症状**: E2E-001でAWS接続エラー

**原因**: AWS認証情報が設定されていない

**解決方法**: 
- E2E-002およびE2E-003のみを実行（クライアント側バリデーションのテスト）
```bash
npm run test:e2e -w services/codec-converter -- tests/e2e/scenario-2-file-size-validation.spec.ts
npm run test:e2e -w services/codec-converter -- tests/e2e/scenario-3-error-handling.spec.ts
```

### 10.2 デバッグ方法

#### ユニットテストのデバッグ

```bash
# 特定のテストのみ実行
npm run test -w services/codec-converter -- tests/unit/validation.test.ts

# デバッグ情報を出力
npm run test -w services/codec-converter -- --verbose
```

#### E2Eテストのデバッグ

```bash
# UI モードで実行（ステップバイステップで確認）
npm run test:e2e:ui -w services/codec-converter

# ブラウザ表示モードで実行
npm run test:e2e:headed -w services/codec-converter

# トレースビューアーで結果を確認
npx playwright show-trace test-results/{test-name}/trace.zip
```

---

## 11. 参考資料

### プラットフォームドキュメント

- [テスト戦略 (全体方針)](../../development/testing.md)
- [コーディング規約](../../development/rules.md)
- [共通設定ファイル](../../development/configs.md)

### サービス固有ドキュメント

- [要件定義](./requirements.md)
- [アーキテクチャ設計](./architecture.md)
- [API仕様](./api-spec.md)
- [デプロイ・運用](./deployment.md)
