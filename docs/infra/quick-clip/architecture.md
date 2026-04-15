# Quick Clip Infrastructure Architecture

## ADR: CloudFormation Export/Import を避け Batch ARN をリテラル構築する

### 背景

Quick Clip の CDK では、`BatchStack` から `LambdaStack` へ Job Queue ARN と Job Definition ARN を
CDK の CloudFormation トークン（`Fn::GetAtt`）で渡していた。CDK はトークンがスタックをまたぐと
自動的に **CloudFormation Export/Import** を生成する。

Job Definition を更新するたびに新しいリビジョン ARN（例: `...-small:1` → `...-small:2`）が生成され、
Export 値が変わる。しかし LambdaStack が `Fn::ImportValue` で参照中の Export は CloudFormation が
更新を拒否するため、Batch 単独のデプロイが毎回失敗していた。

### 決定

`getBatchJobQueueArn()` ユーティリティ（`@nagiyu/infra-common`）を使用し、命名規則から ARN を
文字列リテラルとして構築する。

- `infra/quick-clip/bin/quick-clip.ts` にて `getBatchJobQueueArn(region, account, name)` で ARN を構築
- `batchJobDefinitionArns` prop（`batchStack.jobDefinitionArns` トークン配列）を削除
    - `lambda-stack.ts` の `jobDefinitionArnsWithAndWithoutVersions` が `{prefix}-{variant}` と
      `{prefix}-{variant}:*` の両パターンをカバーするため代替可能
- `lambdaStack.addDependency(batchStack)` を削除

### 影響

- Batch 単独デプロイ（Job Definition リビジョン更新）が LambdaStack の再デプロイなしに実行可能になる
- 初回デプロイは Batch → Lambda の順序を CI/CD または手動デプロイで担保すること
- 先例: `infra/niconico-mylist-assistant/bin/niconico-mylist-assistant.ts` 同パターンを適用
