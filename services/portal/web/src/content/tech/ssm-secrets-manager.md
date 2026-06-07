---
title: 'SSM Parameter Store と Secrets Manager の使い分け：CDK で設定値と機密情報を管理する'
description: 'AWS の設定値・機密情報の保管先として SSM Parameter Store と Secrets Manager のどちらを選ぶべきかを整理。料金・ローテーション・暗号化・参照方法の違いを踏まえ、CDK での定義と Lambda からの取得まで実運用ベースで解説します。'
slug: 'ssm-secrets-manager'
publishedAt: '2026-05-25'
updatedAt: '2026-05-25'
author: 'なぎゆー'
tags: ['AWS', 'SSM', 'Secrets Manager', 'CDK']
categories: ['aws']
---

## はじめに

AWS で「設定値」や「機密情報」をコードの外に追い出そうとすると、まず候補に挙がるのが次の 2 つです。

- **SSM Parameter Store**（`aws-cdk-lib/aws-ssm`、Systems Manager の一機能）
- **Secrets Manager**（`aws-cdk-lib/aws-secretsmanager`）

どちらも「キーと値を安全に保管し、実行時に取得する」という役割は共通しています。そのため最初は「どっちでもいいのでは？」と感じがちですが、料金・ローテーション・サイズ上限などの違いを踏まえると、用途ごとに自然と選択が分かれます。

本記事では両者の違いを整理したうえで、AWS CDK での定義と Lambda からの取得までを実運用ベースでまとめます。

## まず結論：何をどちらに入れるか

迷ったときの基本方針はシンプルです。

| 保管したいもの                         | 推奨                            | 理由                                  |
| -------------------------------------- | ------------------------------- | ------------------------------------- |
| 環境名・エンドポイント URL・機能フラグ | Parameter Store                 | 機密性が低く、無料枠で十分            |
| 外部 API のトークン・固定の認証情報    | Parameter Store（SecureString） | ローテーション不要なら割安            |
| RDS / DB のパスワード                  | Secrets Manager                 | 自動ローテーションと RDS 連携が効く   |
| 定期的に更新したいクレデンシャル全般   | Secrets Manager                 | Lambda によるローテーション機構を内蔵 |

ざっくり言えば「**機密でない設定値・ローテーション不要な秘密は Parameter Store、ローテーションしたい秘密は Secrets Manager**」です。以降でこの判断の根拠を見ていきます。

## 料金とサイズの違い

最初に効いてくるのが料金です。

- **Parameter Store の Standard パラメータは無料**（10,000 件まで、1 件あたり 4KB まで）。API のスループットを上げる Advanced は有料で 8KB まで。
- **Secrets Manager はシークレット 1 件あたり月額課金**（保管料）＋ **API コール課金**。1 件あたり 64KB まで保管できます。

環境名やフラグのような小さな設定値を何十個も持つなら、Parameter Store の無料枠が圧倒的に有利です。逆に「数件のクレデンシャルをローテーションしたい」のであれば、Secrets Manager の月額は機能の対価として十分見合います。

## 暗号化（SecureString）

「Parameter Store は平文、Secrets Manager は暗号化」と誤解されがちですが、Parameter Store にも **SecureString** 型があり、KMS で暗号化できます。

つまり「暗号化したいかどうか」だけでは選べません。判断軸は暗号化の有無ではなく、**ローテーションの要否**だと考えると整理しやすくなります。

## CDK での定義

### Parameter Store

通常の設定値は `StringParameter` で定義します。

```typescript
import * as ssm from 'aws-cdk-lib/aws-ssm';

const apiEndpoint = new ssm.StringParameter(this, 'ApiEndpoint', {
  parameterName: '/myapp/prod/api-endpoint',
  stringValue: 'https://api.example.com',
  description: 'バックエンド API のエンドポイント',
  tier: ssm.ParameterTier.STANDARD,
});
```

注意点として、CDK の `StringParameter` で **SecureString を直接「新規作成」することはできません**（CloudFormation が SecureString の値をテンプレートに平文で持てないため）。SecureString は事前に CLI 等で作成しておき、CDK からは参照する、という運用になります。

```typescript
// 既存の SecureString パラメータを参照する
const dbPassword = ssm.StringParameter.fromSecureStringParameterAttributes(this, 'DbPassword', {
  parameterName: '/myapp/prod/db-password',
});
```

事前作成は CLI で行います。

```bash
aws ssm put-parameter \
  --name "/myapp/prod/db-password" \
  --value "S3cr3t!" \
  --type SecureString
```

### Secrets Manager

Secrets Manager は CDK 側で**値を自動生成**できるのが強みです。パスワードをコードにもテンプレートにも残さずに済みます。

```typescript
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

const dbSecret = new secretsmanager.Secret(this, 'DbSecret', {
  secretName: 'myapp/prod/db-credentials',
  generateSecretString: {
    secretStringTemplate: JSON.stringify({ username: 'admin' }),
    generateStringKey: 'password',
    excludePunctuation: true,
    passwordLength: 32,
  },
});
```

`secretStringTemplate` に固定部分（ユーザー名）を書き、`generateStringKey` で指定したキー（ここでは `password`）の値だけを AWS 側でランダム生成します。生成されたパスワードは誰の目にも触れずに DB 側へ渡せます。

## 命名規則を揃える

どちらを使うにせよ、`/{app}/{env}/{key}` のような階層的な命名に揃えておくと、環境ごとの一括取得や IAM のパス指定が効きます。

```typescript
const prefix = `/myapp/${props.environment}`;
new ssm.StringParameter(this, 'Region', {
  parameterName: `${prefix}/region`,
  stringValue: 'ap-northeast-1',
});
```

IAM ポリシーでも、パスのプレフィックスでまとめて権限を絞れます。

```typescript
new iam.PolicyStatement({
  actions: ['ssm:GetParameter', 'ssm:GetParametersByPath'],
  resources: [`arn:aws:ssm:*:*:parameter/myapp/${props.environment}/*`],
});
```

## Lambda から取得する

### 権限付与は grant で

CDK のコンストラクトには `grantRead` が用意されているので、ARN を手書きせずに権限を付与できます。

```typescript
dbSecret.grantRead(myLambda);
apiEndpoint.grantRead(myLambda);
```

`grantRead` を使うと、対象リソースの ARN・KMS の Decrypt 権限まで CDK が自動で組み立ててくれます。リソースを CDK 内で定義しているなら、この方法がもっとも安全です。

### コード側の取得

Secrets Manager は SDK で取得します。重要なのは「**毎回 API を叩かない**」ことです。Lambda の実行コンテキスト（ハンドラ外）でキャッシュし、コールド/ウォームの再利用に乗せます。

```typescript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({});
let cached: { username: string; password: string } | undefined;

async function getDbCredentials() {
  if (cached) return cached;
  const res = await client.send(
    new GetSecretValueCommand({ SecretId: 'myapp/prod/db-credentials' })
  );
  cached = JSON.parse(res.SecretString ?? '{}');
  return cached!;
}
```

ハンドラの外で `client` とキャッシュを宣言しておくと、ウォームスタート時は API コールを丸ごとスキップできます。Secrets Manager は API コール課金があるため、この一手間がコストにも直結します。

なお、AWS Parameters and Secrets Lambda Extension を使えば、ローカルキャッシュ付きの HTTP エンドポイント経由で取得でき、自前キャッシュを書かずに済みます。シンプルに保ちたい場合の選択肢です。

## ローテーション：Secrets Manager の本領

Secrets Manager を選ぶ最大の理由がローテーションです。RDS と組み合わせる場合、CDK の `addRotationSchedule` でローテーション用 Lambda まで含めて構築できます。

```typescript
dbSecret.addRotationSchedule('Rotation', {
  hostedRotation: secretsmanager.HostedRotation.mysqlSingleUser({
    functionName: 'myapp-db-rotation',
  }),
  automaticallyAfter: cdk.Duration.days(30),
});
```

これで 30 日ごとにパスワードが自動更新され、新しい値が同じシークレット ARN から取得できます。アプリ側は ARN を見続けるだけでよく、更新タイミングを意識する必要がありません。Parameter Store にはこの仕組みがないため、ローテーション要件があるなら Secrets Manager 一択です。

## ハマったポイント

**SecureString を CDK で作ろうとして失敗する**

前述の通り、SecureString の新規作成は CDK ではできません。「`StringParameter` に `type: SecureString` を渡せばいい」と思い込んでハマりがちです。SecureString は CLI で事前作成 → CDK で参照、という分担を最初から決めておくのが安全です。

**シークレットの値を取りすぎてコストが膨らむ**

Secrets Manager は API コール課金です。ハンドラ内で毎回 `GetSecretValue` を呼ぶ実装にすると、高頻度の Lambda ではコールド/ウォーム問わず課金が積み上がります。キャッシュは「あれば良い」ではなく必須と考えたほうがよいです。

## まとめ

Parameter Store と Secrets Manager は競合ではなく役割分担です。**機密でない設定値とローテーション不要の秘密は Parameter Store の無料枠で十分**、**ローテーションしたいクレデンシャルは Secrets Manager** という線引きで、ほとんどのケースは判断できます。

CDK では `grantRead` で権限を、Secrets Manager では `generateSecretString` で値の自動生成を活用すれば、機密情報をコードにもテンプレートにも残さずに運用できます。最後に、取得側のキャッシュだけは忘れずに入れておきましょう。
