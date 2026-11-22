import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';

/**
 * Function URL のオリジンに OAC を付けるための HttpOrigin
 *
 * `FunctionUrlOrigin.withOriginAccessControl` は IFunctionUrl を受け取り、CloudFront のスタックの中で
 * Lambda に許可を足す。Lambda が別スタックにあり URL が文字列で渡ってくるときは使えないため、
 * ドメイン文字列から HttpOrigin を作り、OAC の ID だけを差し込む。
 */
class FunctionUrlOacOrigin extends origins.HttpOrigin {
  private readonly oacId: string;

  constructor(domainName: string, oacId: string) {
    super(domainName, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      httpsPort: 443,
      originSslProtocols: [cloudfront.OriginSslPolicy.TLS_V1_2],
    });
    this.oacId = oacId;
  }

  public bind(
    scope: Construct,
    options: cloudfront.OriginBindOptions
  ): cloudfront.OriginBindConfig {
    const config = super.bind(scope, options);
    if (!config.originProperty) {
      return config;
    }
    return {
      ...config,
      originProperty: {
        ...config.originProperty,
        originAccessControlId: this.oacId,
      },
    };
  }
}

/**
 * Function URL のオリジンを作る関数のプロパティ
 */
export interface FunctionUrlOriginProps {
  /**
   * OAC の名前 (アカウント内で一意)
   */
  originAccessControlName: string;

  /**
   * Function URL (`https://xxx.lambda-url.<region>.on.aws/`)
   */
  functionUrl: string;
}

/**
 * Lambda 用の OAC を作り、それを付けた Function URL のオリジンを返す
 *
 * 署名は常に行う。1 つのオリジンを複数の behavior で共有すると、ディストリビューションの
 * オリジンも 1 つにまとまる。
 *
 * @param scope CloudFront のスタック
 * @param id 構成 ID
 * @param props OAC の名前と Function URL
 * @returns オリジンと OAC
 */
export function createFunctionUrlOrigin(
  scope: Construct,
  id: string,
  props: FunctionUrlOriginProps
): { origin: cloudfront.IOrigin; originAccessControl: cloudfront.CfnOriginAccessControl } {
  const originAccessControl = new cloudfront.CfnOriginAccessControl(scope, `${id}Oac`, {
    originAccessControlConfig: {
      name: props.originAccessControlName,
      description: 'Lambda Function URL への CloudFront からの署名付きアクセス',
      originAccessControlOriginType: 'lambda',
      signingBehavior: 'always',
      signingProtocol: 'sigv4',
    },
  });

  // CDK Token の場合でも解けるよう Fn で分解する
  const hostAndPath = cdk.Fn.select(1, cdk.Fn.split('//', props.functionUrl));
  const domainName = cdk.Fn.select(0, cdk.Fn.split('/', hostAndPath));

  return {
    origin: new FunctionUrlOacOrigin(domainName, originAccessControl.attrId),
    originAccessControl,
  };
}
