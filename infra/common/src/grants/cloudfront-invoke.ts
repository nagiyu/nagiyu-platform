import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';

/**
 * CloudFront から Function URL を呼ぶ許可を足すときのオプション
 */
export interface GrantCloudFrontInvokeOptions {
  /**
   * 許可する配信の ARN
   *
   * 配信が Lambda のスタックより後に作られるときは配信の ARN を参照すると循環するため、
   * 省略時はこのアカウントの全配信を許可する。
   */
  sourceArn?: string;
}

/**
 * CloudFront (OAC) が Function URL を呼ぶための許可を Lambda に足す
 *
 * `lambda:InvokeFunctionUrl` に加え、Function URL 経由に限った `lambda:InvokeFunction` も要る。
 * 公開アクセスの許可 (authType NONE) とは別に足すので、既存の許可は変えない。
 *
 * @param fn 対象の Lambda 関数
 * @param options 許可するソースの絞り込み
 */
export function grantCloudFrontInvoke(
  fn: lambda.IFunction,
  options: GrantCloudFrontInvokeOptions = {}
): void {
  const sourceArn =
    options.sourceArn ??
    cdk.Stack.of(fn).formatArn({
      service: 'cloudfront',
      region: '',
      resource: 'distribution',
      resourceName: '*',
    });
  const principal = new iam.ServicePrincipal('cloudfront.amazonaws.com');

  fn.addPermission('AllowCloudFrontInvokeFunctionUrl', {
    principal,
    action: 'lambda:InvokeFunctionUrl',
    functionUrlAuthType: lambda.FunctionUrlAuthType.AWS_IAM,
    sourceArn,
  });

  fn.addPermission('AllowCloudFrontInvokeFunction', {
    principal,
    action: 'lambda:InvokeFunction',
    invokedViaFunctionUrl: true,
    sourceArn,
  });
}
