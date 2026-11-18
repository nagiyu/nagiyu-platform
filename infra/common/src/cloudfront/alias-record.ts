import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import { SSM_PARAMETERS } from '../utils/ssm';

/**
 * CloudFront 向け ALIAS レコードのプロパティ
 */
export interface CloudFrontAliasRecordProps {
  /**
   * ALIAS の向き先の CloudFront ディストリビューション
   */
  distribution: cloudfront.IDistribution;

  /**
   * ゾーンルートからの相対名 (例: share-together)
   * @default ゾーン頂点
   */
  recordName?: string;

  /**
   * レコードのコメント
   */
  comment: string;

  /**
   * ホストゾーン名
   *
   * 指定したときは SSM の hosted-zone-name を引かない。ゾーン名を別の経路で受け取っている
   * スタックのテンプレートに、使わない SSM パラメータを増やさないため。
   * @default SSM の hosted-zone-name
   */
  zoneName?: string;
}

/**
 * 共有のホストゾーンに、CloudFront 向けの ALIAS の A レコードを作成する。
 *
 * ホストゾーンは SSM に登録された ID (と名前) から参照する。
 *
 * @param scope - 親コンストラクト (ホストゾーンの参照もここに作られる)
 * @param id - レコードのコンストラクト ID
 * @param props - レコードのプロパティ
 * @returns 作成したレコード
 */
export function createCloudFrontAliasRecord(
  scope: Construct,
  id: string,
  props: CloudFrontAliasRecordProps
): route53.ARecord {
  const { distribution, recordName, comment, zoneName } = props;

  const hostedZoneId = ssm.StringParameter.valueForStringParameter(
    scope,
    SSM_PARAMETERS.ROUTE53_HOSTED_ZONE_ID
  );
  const resolvedZoneName =
    zoneName ??
    ssm.StringParameter.valueForStringParameter(scope, SSM_PARAMETERS.ROUTE53_HOSTED_ZONE_NAME);

  // 同じ scope に複数のレコードを作っても ID が重ならないよう、レコードの ID から導く。
  const hostedZone = route53.HostedZone.fromHostedZoneAttributes(scope, `${id}HostedZone`, {
    hostedZoneId,
    zoneName: resolvedZoneName,
  });

  return new route53.ARecord(scope, id, {
    zone: hostedZone,
    recordName,
    target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    comment,
  });
}
