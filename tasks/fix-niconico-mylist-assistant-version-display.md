# Niconico Mylist Assistant Webバージョン表示の修正

## 概要

Niconico Mylist Assistant の Web アプリケーションで、バージョンがデフォルトの "0.1.0" のまま表示されている問題を修正する。

Workflow と Dockerfile で `APP_VERSION` 環境変数を設定しているが、Lambda 側で環境変数として受け取られていないことが原因。

## 関連情報

- タスクタイプ: サービスタスク（niconico-mylist-assistant）
- 影響範囲: インフラストラクチャ（CDK）
- 関連ファイル:
    - `infra/niconico-mylist-assistant/bin/niconico-mylist-assistant.ts`
    - `infra/niconico-mylist-assistant/lib/lambda-stack.ts`

## 問題の詳細

### 現状

1. **Workflow**: `.github/workflows/niconico-mylist-assistant-deploy.yml` (L123-129) で `package.json` からバージョンを取得
2. **Docker Build**: Workflow (L151) で `--build-arg APP_VERSION` として渡される
3. **Dockerfile**: `services/niconico-mylist-assistant/web/Dockerfile` (L9-10) で受け取り、ENV として設定
4. **Lambda 環境変数**: CDK の Lambda スタックで `APP_VERSION` が設定されていない
5. **Next.js**: `layout.tsx` (L20) で `process.env.APP_VERSION || '0.1.0'` として参照されるが、Lambda の環境変数に存在しないためデフォルト値が使用される

### 根本原因

- **bin ファイル**: `infra/niconico-mylist-assistant/bin/niconico-mylist-assistant.ts` で `APP_VERSION` を環境変数から読み取っていない
- **Lambda スタック**: `infra/niconico-mylist-assistant/lib/lambda-stack.ts` の `LambdaStackProps` に `appVersion` プロパティが存在しない
- **Lambda 環境変数**: Lambda Function の `environment` オブジェクトに `APP_VERSION` が含まれていない

### 他サービスとの比較

**Stock Tracker** と **Tools** サービスでは正しく実装されている:

- **bin ファイル**: `process.env.APP_VERSION || '1.0.0'` で環境変数から取得
- **Lambda スタック Props**: `appVersion: string` プロパティを定義
- **Lambda 環境変数**: `APP_VERSION: appVersion` を設定

## 要件

### 機能要件

- FR1: CDK bin ファイルで `APP_VERSION` 環境変数を読み取る
- FR2: Lambda スタックに `appVersion` プロパティを追加する
- FR3: Lambda Function の環境変数に `APP_VERSION` を設定する
- FR4: Web アプリケーションで正しいバージョン（`package.json` の値）が表示される

### 非機能要件

- NFR1: 既存の他サービス（stock-tracker, tools）と同じパターンで実装する
- NFR2: デフォルト値は '1.0.0' とする（他サービスと統一）
- NFR3: 既存のデプロイプロセスを変更しない（Workflow の変更は不要）
- NFR4: dev/prod 環境の両方で動作する

## 実装方針

### 1. CDK bin ファイルの修正

`infra/niconico-mylist-assistant/bin/niconico-mylist-assistant.ts` に以下を追加:

- 環境変数 `APP_VERSION` を読み取る（デフォルト: '1.0.0'）
- Lambda スタック初期化時に `appVersion` パラメータとして渡す

**参考実装**: `infra/stock-tracker/bin/stock-tracker.ts` (L28), `infra/tools/bin/tools.ts` (L14)

### 2. Lambda スタックの Props 定義修正

`infra/niconico-mylist-assistant/lib/lambda-stack.ts` の `LambdaStackProps` インターフェースに追加:

- `appVersion: string` プロパティを追加

**参考実装**: `infra/stock-tracker/lib/lambda-stack.ts` (L14), `infra/tools/lib/lambda-stack.ts` (L9)

### 3. Lambda Function 環境変数の設定

`infra/niconico-mylist-assistant/lib/lambda-stack.ts` の Lambda Function 定義に追加:

- `environment` オブジェクトに `APP_VERSION: props.appVersion` を追加

**参考実装**: `infra/stock-tracker/lib/lambda-stack.ts` (L101), `infra/tools/lib/lambda-stack.ts` (L39)

## 実装ステップ

### Phase 1: CDK コード修正

- [ ] bin ファイルで `APP_VERSION` 環境変数を読み取る処理を追加
- [ ] `LambdaStackProps` に `appVersion` プロパティを追加
- [ ] Lambda スタック初期化時に `appVersion` を渡す
- [ ] Lambda Function の環境変数に `APP_VERSION` を追加

### Phase 2: ビルドとテスト

- [ ] CDK プロジェクトのビルドが成功することを確認
- [ ] TypeScript の型チェックが通ることを確認
- [ ] 既存のテストが失敗しないことを確認

### Phase 3: デプロイ検証（手動）

- [ ] dev 環境へのデプロイを実行
- [ ] CloudFormation スタックの更新が成功することを確認
- [ ] Lambda 環境変数に `APP_VERSION` が設定されていることを確認
- [ ] Web アプリケーションで正しいバージョンが表示されることを確認

## テスト方針

### ビルドテスト

- CDK プロジェクトのビルドエラーがないこと
- TypeScript の型チェックが通ること

### 手動デプロイテスト（dev環境）

1. GitHub Actions の deploy workflow を実行
2. CloudFormation コンソールで Lambda スタックの環境変数を確認
3. Web アプリケーションにアクセスし、ブラウザの開発者ツールで version が正しく表示されているか確認

### 受け入れ基準

- Lambda 環境変数に `APP_VERSION` が設定されている
- Web アプリケーションのフッターまたはコンソールに `package.json` のバージョンが表示される
- デフォルト値 "0.1.0" ではなく、実際のバージョン（例: "1.0.0"）が表示される

## 注意事項

### デプロイタイミング

- Workflow では Docker ビルド時（build-web ジョブ）に `APP_VERSION` が設定される
- CDK デプロイ時（deploy ジョブ）には `APP_VERSION` 環境変数は存在しない可能性がある
- そのため、CDK bin ファイルではデフォルト値 '1.0.0' を使用する
- 実際のバージョンは Docker イメージ内に埋め込まれているため、Lambda 環境変数として改めて設定する必要はないが、一貫性のため設定する

### 既存サービスとの一貫性

- stock-tracker, tools と同じパターンで実装する
- デフォルト値は '1.0.0' とする（'0.1.0' ではない）

### Dockerfile と Lambda 環境変数の関係

- Dockerfile の `ARG APP_VERSION` はビルド時にのみ有効
- Lambda コンテナ内で `process.env.APP_VERSION` として参照するには、Lambda 環境変数として設定が必要
- Dockerfile の `ENV APP_VERSION=${APP_VERSION}` だけでは Lambda 環境変数として引き継がれない

## 参考ドキュメント

- [コーディング規約](../../docs/development/rules.md)
- [サービステンプレート](../../docs/development/service-template.md)
- [Stock Tracker Lambda Stack](../../infra/stock-tracker/lib/lambda-stack.ts)
- [Tools Lambda Stack](../../infra/tools/lib/lambda-stack.ts)

## 備考

### 技術的背景

Docker イメージ内の ENV 変数は、Lambda コンテナ起動時に自動的に引き継がれないため、CDK で明示的に環境変数として設定する必要がある。

### 今後の改善案

- バージョン情報を CloudFormation Output として出力し、デプロイ完了時に確認できるようにする
- Web アプリケーションの `/api/health` エンドポイントにバージョン情報を含める
