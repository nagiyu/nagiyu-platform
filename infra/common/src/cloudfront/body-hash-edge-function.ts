import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

/**
 * 本文ハッシュを付ける Lambda@Edge の関連付けを作る
 *
 * Lambda@Edge の関数は us-east-1 にしか作れないため、CloudFront と同じ (us-east-1 の) スタックの
 * 中に作る。コードは `edge-handlers/body-hash` を tsc が JS にした出力 (dist) から配るため、
 * ts-jest で src から動かすときのアセットは JS を含まないが、合成の検証には影響しない。
 *
 * @param scope CloudFront のスタック (us-east-1)
 * @param id 関数の構成 ID
 * @returns 本文が必要な behavior の `edgeLambdas` に渡す関連付け
 */
export function createBodyHashEdgeLambdas(scope: Construct, id: string): cloudfront.EdgeLambda[] {
  // 実行ロールは Lambda と Lambda@Edge の両方に信頼させる必要がある
  const role = new iam.Role(scope, `${id}Role`, {
    assumedBy: new iam.CompositePrincipal(
      new iam.ServicePrincipal('lambda.amazonaws.com'),
      new iam.ServicePrincipal('edgelambda.amazonaws.com')
    ),
    managedPolicies: [
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
    ],
  });

  const fn = new lambda.Function(scope, id, {
    // Lambda@Edge は環境変数・ARM64 を使えない
    runtime: lambda.Runtime.NODEJS_22_X,
    architecture: lambda.Architecture.X86_64,
    handler: 'handler.handler',
    code: lambda.Code.fromAsset(path.join(__dirname, 'edge-handlers', 'body-hash')),
    role,
    memorySize: 128,
    // origin-request の上限 (30 秒) に対し、ハッシュ計算だけなので短く切る
    timeout: cdk.Duration.seconds(5),
    description: 'Sets x-amz-content-sha256 to the SHA256 of the request body on origin-request',
  });

  return [
    {
      // Lambda@Edge の関連付けはバージョンを指す必要がある
      functionVersion: fn.currentVersion,
      eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST,
      includeBody: true,
    },
  ];
}
