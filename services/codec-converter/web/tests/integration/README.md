# Codec Converter E2E Tests

このディレクトリには、Codec Converter サービスの統合テスト（E2Eテスト）が含まれています。

## テスト概要

以下の3つのシナリオをカバーしています：

### シナリオ1: 正常系（H.264変換）
- ファイルのアップロード
- 出力コーデックの選択
- ジョブIDの発行
- ステータス遷移の確認（PENDING → PROCESSING → COMPLETED）
- ダウンロードリンクの表示

**ファイル**: `scenario-1-happy-path.spec.ts`

**注意**: このテストは実際のAWS環境が必要です。

### シナリオ2: エラーハンドリング（ファイルサイズ超過）
- 500MB超のファイルのバリデーションエラー
- エラーメッセージの表示
- アップロードの中止

**ファイル**: `scenario-2-file-size-validation.spec.ts`

**注意**: このテストはAWS環境なしで実行可能です（クライアント側バリデーションのみ）。

### シナリオ3: エラーハンドリング（FFmpeg失敗）
- 不正なファイルのアップロード
- ジョブステータスがFAILEDになることの確認
- エラーメッセージの記録

**ファイル**: `scenario-3-error-handling.spec.ts`

**注意**: このテストは実際のAWS環境が必要です。

## テスト実行方法

### ローカル環境での実行

#### 前提条件
1. Next.js開発サーバーが起動していること、またはPlaywright設定でwebServerが有効になっていること
2. AWS環境が設定されていること（シナリオ1と3を実行する場合）

#### すべてのテストを実行
```bash
npm run test:e2e
```

#### 特定のブラウザでテストを実行
```bash
# chromium-mobileのみ（スマホファースト）
PROJECT=chromium-mobile npm run test:e2e

# chromium-desktopのみ
PROJECT=chromium-desktop npm run test:e2e

# webkit-mobileのみ（Safari相当）
PROJECT=webkit-mobile npm run test:e2e
```

#### 特定のテストファイルのみ実行
```bash
npm run test:e2e tests/integration/scenario-2-file-size-validation.spec.ts
```

#### UIモードで実行（インタラクティブ）
```bash
npm run test:e2e:ui
```

### CI/CD環境での実行

#### 環境変数
以下の環境変数を設定してください：

- `BASE_URL`: テスト対象のベースURL（例: `https://codec-converter-dev.example.com`）
- `AWS_REGION`: AWSリージョン（例: `us-east-1`）
- その他のAWS認証情報（必要に応じて）

#### GitHub Actions での実行例
```yaml
- name: Run E2E tests
  env:
    BASE_URL: ${{ secrets.DEV_BASE_URL }}
    AWS_REGION: us-east-1
    PROJECT: chromium-mobile
  run: npm run test:e2e -w services/codec-converter/web
```

## テスト結果の確認

テスト実行後、以下のディレクトリに結果が出力されます：

- `playwright-report/`: HTMLレポート
- `test-results/`: JSON形式の詳細結果、スクリーンショット、動画

HTMLレポートを開くには：
```bash
npx playwright show-report
```

## トラブルシューティング

### ブラウザがインストールされていない
```bash
npx playwright install chromium
```

### タイムアウトエラーが発生する
シナリオ1と3では、変換処理に時間がかかる場合があります。テストのタイムアウトは自動的に調整されていますが、必要に応じて `playwright.config.ts` を編集してください。

### AWS環境が利用できない
シナリオ2のみを実行してください：
```bash
npm run test:e2e tests/integration/scenario-2-file-size-validation.spec.ts
```

## ヘルパー関数

`helpers.ts` には以下のユーティリティ関数が含まれています：

- `createTestVideoFile(sizeInMB)`: テスト用のMP4ファイルを生成
- `generateTestFileName()`: ユニークなファイル名を生成
- `waitForJobStatus(page, status, timeout)`: ジョブステータスの遷移を待機

## 開発時の注意事項

- テストファイルは `*.spec.ts` の命名規則に従ってください
- AWS環境が必要なテストは `test.skip()` で条件付きスキップを設定してください
- スマホファーストの原則に従い、`chromium-mobile` でのテストを優先してください
