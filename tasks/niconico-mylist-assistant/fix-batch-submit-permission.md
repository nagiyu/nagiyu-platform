# バッチジョブ投入権限の修正

## 概要

Niconico Mylist Assistant において、マイリスト登録バッチジョブの投入時に `AccessDeniedException` が発生する問題を修正する。

Web Lambda の実行ロールに `batch:SubmitJob` 権限が付与されておらず、また必要な環境変数（`BATCH_JOB_QUEUE`、`BATCH_JOB_DEFINITION`）が Lambda 関数に設定されていないことが原因。

## 関連情報

- **Issue**: [Bug] バッチのジョブ投入に失敗する
- **タスクタイプ**: サービスタスク（インフラ設定）
- **影響範囲**: Niconico Mylist Assistant サービス
- **優先度**: High（機能が動作しない）

## 問題の詳細

### 発生している問題

1. `/mylist/register` API でマイリスト登録バッチを投入しようとすると、以下のエラーが発生する：

```
AccessDeniedException: User: arn:aws:sts::166562222746:assumed-role/niconico-mylist-assistant-web-execution-role-dev/niconico-mylist-assistant-web-dev is not authorized to perform: batch:SubmitJob on resource: arn:aws:batch:us-east-1:166562222746:job-definition/ because no identity-based policy allows the batch:SubmitJob action
```

### 原因分析

1. **権限不足**: `infra/niconico-mylist-assistant/lib/policies/web-runtime-policy.ts` に `batch:SubmitJob` 権限が含まれていない
2. **環境変数未設定**: `infra/niconico-mylist-assistant/lib/lambda-stack.ts` の Lambda 関数環境変数に `BATCH_JOB_QUEUE` と `BATCH_JOB_DEFINITION` が設定されていない

### 影響を受けるファイル

- `services/niconico-mylist-assistant/web/src/app/api/mylist/register/route.ts` - バッチジョブ投入を行う API ルート
- `infra/niconico-mylist-assistant/lib/policies/web-runtime-policy.ts` - Web Lambda の実行権限ポリシー
- `infra/niconico-mylist-assistant/lib/lambda-stack.ts` - Lambda 関数の定義と環境変数設定

## 要件

### 機能要件（FR）

- **FR1**: Web Lambda から AWS Batch ジョブを正常に投入できること
- **FR2**: `/mylist/register` API が正常に動作し、マイリスト登録バッチが起動すること
- **FR3**: 開発環境（dev）と本番環境（prod）の両方で動作すること

### 非機能要件（NFR）

- **NFR1**: 最小権限の原則に従い、必要最小限の権限のみを付与すること
- **NFR2**: 既存の WebRuntimePolicy の設計パターン（DynamoDB 権限と同様）に従うこと
- **NFR3**: 開発用 IAM ユーザーにも同じ権限が自動的に付与されること（WebRuntimePolicy の共有設計）
- **NFR4**: 環境変数は CDK スタック間で適切に受け渡しすること

## 実装方針

### 1. Web Runtime Policy への Batch 権限追加

`WebRuntimePolicy` に以下の権限を追加する：

- **Action**: `batch:SubmitJob`
- **Resource**: Batch Job Definition と Job Queue の ARN を指定
- **設計方針**: DynamoDB 権限と同様の PolicyStatement パターンを使用

### 2. Lambda Stack への環境変数追加

`LambdaStack` の Lambda 関数環境変数に以下を追加する：

- `BATCH_JOB_QUEUE`: Batch Stack から jobQueueArn を受け取る
- `BATCH_JOB_DEFINITION`: Batch Stack から jobDefinitionArn を受け取る

### 3. Stack 間の依存関係の確認

- Lambda Stack が Batch Stack の出力（jobQueueArn、jobDefinitionArn）を受け取れるよう、適切な依存関係を設定する
- 現在の CDK bin ファイル（`bin/niconico-mylist-assistant.ts`）で依存関係を確認・調整する

## 実装タスク

### Phase 1: 権限とリソースの追加

- [ ] **T001**: `WebRuntimePolicy` に `batch:SubmitJob` 権限を追加
    - ファイル: `infra/niconico-mylist-assistant/lib/policies/web-runtime-policy.ts`
    - Batch Job Queue と Job Definition の ARN をプロパティとして受け取る
    - PolicyStatement を追加（sid: 'BatchJobSubmission'）

- [ ] **T002**: `WebRuntimePolicyProps` インターフェースを拡張
    - `jobQueueArn: string` プロパティを追加
    - `jobDefinitionArn: string` プロパティを追加

### Phase 2: Lambda Stack の更新

- [ ] **T003**: `LambdaStackProps` インターフェースを拡張
    - `jobQueueArn: string` プロパティを追加
    - `jobDefinitionArn: string` プロパティを追加

- [ ] **T004**: Lambda 関数の環境変数に Batch 情報を追加
    - ファイル: `infra/niconico-mylist-assistant/lib/lambda-stack.ts`
    - `BATCH_JOB_QUEUE`: props.jobQueueArn
    - `BATCH_JOB_DEFINITION`: props.jobDefinitionArn

- [ ] **T005**: WebRuntimePolicy のコンストラクタ呼び出しを更新
    - jobQueueArn と jobDefinitionArn を渡す

### Phase 3: CDK メインファイルの更新

- [ ] **T006**: `bin/niconico-mylist-assistant.ts` で Stack 間のデータ受け渡しを設定
    - Lambda Stack 作成時に Batch Stack の出力を渡す
    - 依存関係の確認（Lambda Stack が Batch Stack に依存することを確認）

### Phase 4: デプロイとテスト

- [ ] **T007**: CDK 変更をデプロイ（dev 環境）
    - `cdk deploy --all -c env=dev`
    - CloudFormation スタック更新の確認

- [ ] **T008**: 動作確認
    - `/mylist/register` API を呼び出し
    - バッチジョブが正常に投入されることを確認
    - CloudWatch Logs でエラーが発生していないことを確認

- [ ] **T009**: IAM ユーザー権限の確認（開発環境のみ）
    - 開発用 IAM ユーザーにも Batch 権限が付与されていることを確認
    - ローカル開発環境から同じ操作が可能なことを確認

## セキュリティ考慮事項

### 最小権限の原則

- **Action**: `batch:SubmitJob` のみを許可（`batch:*` は使用しない）
- **Resource**: 特定の Job Queue と Job Definition の ARN のみを指定（ワイルドカードは使用しない）

### 権限の範囲

- Web Lambda は Job の投入（SubmitJob）のみ可能
- Job のキャンセルや削除などの管理操作は含めない
- Job の実行権限は Batch Job Role が保持（分離されている）

## テストとデプロイ

### テスト方針

1. **単体テスト**: 既存のテストが引き続き動作することを確認（インフラ変更のためコードテストは不要）
2. **統合テスト**: dev 環境で実際に `/mylist/register` API を呼び出し、バッチジョブが投入されることを確認
3. **E2E テスト**: 既存の E2E テストが引き続き動作することを確認

### デプロイ手順

1. **dev 環境へのデプロイ**: 変更を dev 環境にデプロイして動作確認
2. **動作確認**: マイリスト登録機能が正常に動作することを確認
3. **prod 環境へのデプロイ**: 問題がなければ prod 環境にデプロイ

### 受け入れ基準

- [ ] Web Lambda から `batch:SubmitJob` が正常に実行できる
- [ ] `/mylist/register` API が 200 OK を返し、jobId が返却される
- [ ] CloudWatch Logs に `AccessDeniedException` が出力されない
- [ ] バッチジョブが AWS Batch コンソールで確認できる
- [ ] 開発用 IAM ユーザーにも同じ権限が付与されている（dev 環境）

## 参考ドキュメント

- [Niconico Mylist Assistant アーキテクチャ](./architecture.md)
- [Niconico Mylist Assistant デプロイメント](./deployment.md)
- [AWS Batch ドキュメント](https://docs.aws.amazon.com/batch/)
- [IAM 最小権限のベストプラクティス](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege)

## 備考

### 設計の一貫性

- WebRuntimePolicy は Web Lambda と開発用 IAM ユーザーで共有される設計
- この設計により、開発者は本番環境と同じ権限でローカルテストが可能
- Batch 権限も同じパターンで追加することで、一貫性を保つ

### 将来の拡張性

- 現在は SubmitJob のみだが、将来的に Job のステータス確認（DescribeJobs）や一覧取得（ListJobs）が必要になる可能性がある
- その場合も同じ WebRuntimePolicy に追加することで、一貫した権限管理が可能

### 環境変数の命名規則

- 既存の環境変数（`DYNAMODB_TABLE_NAME`、`AWS_REGION` など）と同じ命名規則に従う
- AWS リソースの ARN は完全な形式で渡す（パース不要）
