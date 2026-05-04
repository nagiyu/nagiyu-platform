import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { SSM_PARAMETERS } from '../libs/utils/ssm';

export interface Route53RecordsStackProps extends cdk.StackProps {
  domainName: string;
}

// Route53 が公開している、すべての CloudFront ディストリビューションに共通の hosted zone ID
// https://docs.aws.amazon.com/general/latest/gr/cf_region.html
const CLOUDFRONT_HOSTED_ZONE_ID = 'Z2FDTNDATAQYW2';

const RECORD_TTL = cdk.Duration.seconds(300);

/**
 * Phase 2 で Route53 に複製する CloudFront 向け CNAME 一覧
 * （NS 切替後に Phase 6 で ALIAS に置換予定）
 */
const CLOUDFRONT_CNAMES: ReadonlyArray<{
  recordName: string;
  target: string;
  comment: string;
}> = [
  { recordName: 'dev', target: 'd1p44g973egas4.cloudfront.net', comment: 'Root (dev)' },
  { recordName: 'tools', target: 'dxsm9dplwcq8k.cloudfront.net', comment: 'Tools (prod)' },
  { recordName: 'dev-tools', target: 'di5qiqkse31ld.cloudfront.net', comment: 'Tools (dev)' },
  { recordName: 'auth', target: 'd34m95nq713g26.cloudfront.net', comment: 'Auth (prod)' },
  { recordName: 'dev-auth', target: 'dqwp0hty66uo0.cloudfront.net', comment: 'Auth (dev)' },
  { recordName: 'admin', target: 'da84amiv79v4m.cloudfront.net', comment: 'Admin (prod)' },
  { recordName: 'dev-admin', target: 'd20d90d0yxf3hy.cloudfront.net', comment: 'Admin (dev)' },
  { recordName: 'quick-clip', target: 'd1v96dysvz62zc.cloudfront.net', comment: 'Quick Clip (prod)' },
  { recordName: 'dev-quick-clip', target: 'dh18sa23cobm6.cloudfront.net', comment: 'Quick Clip (dev)' },
  { recordName: 'stock-tracker', target: 'd1n3pw1wiam9k0.cloudfront.net', comment: 'Stock Tracker (prod)' },
  { recordName: 'dev-stock-tracker', target: 'd1vh86o7kq78ya.cloudfront.net', comment: 'Stock Tracker (dev)' },
  { recordName: 'share-together', target: 'd3vh0c4lc7bae6.cloudfront.net', comment: 'Share Together (prod)' },
  { recordName: 'dev-share-together', target: 'd3f8lnzpu25qxe.cloudfront.net', comment: 'Share Together (dev)' },
  { recordName: 'niconico-mylist-assistant', target: 'd2jj4a3zh6zf5h.cloudfront.net', comment: 'Niconico Mylist Assistant (prod)' },
  { recordName: 'dev-niconico-mylist-assistant', target: 'd1m48o6sp5o6j9.cloudfront.net', comment: 'Niconico Mylist Assistant (dev)' },
  { recordName: 'codec-converter', target: 'd1bh7qvatnkglt.cloudfront.net', comment: 'Codec Converter (prod)' },
  { recordName: 'dev-codec-converter', target: 'dj528on1g8nw0.cloudfront.net', comment: 'Codec Converter (dev)' },
];

/**
 * apex (root) を CloudFront に向ける ALIAS 用の CloudFront ディストリビューションドメイン
 * Route53 では apex に CNAME を作成できないため、Phase 2 から ALIAS で登録する
 */
const APEX_CLOUDFRONT_DOMAIN = 'd1k6ec293qn4f7.cloudfront.net';

/**
 * Google Search Console のドメイン所有権確認用 CNAME
 * NS 切替後も検証状態を維持するため Route53 にも複製する
 */
const GOOGLE_SEARCH_CONSOLE_CNAME = {
  recordName: 'hnjg6vgudcwv',
  target: 'gv-d6lr3lnlnk6zbu.dv.googlehosted.com',
  comment: 'Google Search Console domain ownership verification',
};

/**
 * Phase 2: 既存 XServer DNS レコードを Route53 に複製するスタック
 *
 * - NS 切替（Phase 4）の前に、Route53 が XServer と同じ応答を返せる状態を作る
 * - すべての CloudFront 向けレコードは一旦 CNAME のまま複製（apex を除く）
 * - apex は Route53 の制約で CNAME 不可のため、最初から ALIAS で登録
 * - ACM 検証 CNAME は Phase 5 で自動化するため本スタックでは複製しない
 */
export class Route53RecordsStack extends cdk.Stack {
  public constructor(scope: Construct, id: string, props: Route53RecordsStackProps) {
    super(scope, id, props);

    const hostedZoneId = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.ROUTE53_HOSTED_ZONE_ID,
    );

    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId,
      zoneName: props.domainName,
    });

    for (const spec of CLOUDFRONT_CNAMES) {
      new route53.CnameRecord(this, `Cname${this.toPascalCase(spec.recordName)}`, {
        zone: hostedZone,
        recordName: spec.recordName,
        domainName: spec.target,
        ttl: RECORD_TTL,
        comment: spec.comment,
      });
    }

    new route53.CnameRecord(this, 'CnameGoogleSearchConsole', {
      zone: hostedZone,
      recordName: GOOGLE_SEARCH_CONSOLE_CNAME.recordName,
      domainName: GOOGLE_SEARCH_CONSOLE_CNAME.target,
      ttl: RECORD_TTL,
      comment: GOOGLE_SEARCH_CONSOLE_CNAME.comment,
    });

    new route53.ARecord(this, 'ApexAliasToCloudFront', {
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias({
        bind: () => ({
          dnsName: APEX_CLOUDFRONT_DOMAIN,
          hostedZoneId: CLOUDFRONT_HOSTED_ZONE_ID,
        }),
      }),
      comment: 'Root apex (alias to CloudFront, replaces XServer CNAME)',
    });
  }

  private toPascalCase(value: string): string {
    return value
      .split('-')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join('');
  }
}
