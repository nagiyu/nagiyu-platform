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
 * 新規サービスの CloudFront 向け ALIAS レコード定義。
 *
 * 既存サービス（CLOUDFRONT_CNAMES）は XServer から複製した CNAME を維持しているが、
 * これ以降に新規追加するサービスは ARecord ALIAS で登録する方針。
 *
 * `domainNameSsmParam` で指定された SSM パラメータからディストリビューションドメインを
 * 取得するため、サービス側 CloudFront スタックが先にデプロイされている必要がある。
 * 該当 SSM が存在しない環境を含めて配列に追加すると `route53-records-stack` の
 * deploy で CloudFormation エラーになるため、追加は対象 CloudFront のデプロイ完了後に行う。
 */
const CLOUDFRONT_ALIAS_RECORDS: ReadonlyArray<{
  recordName: string;
  domainNameSsmParam: string;
  comment: string;
}> = [
  {
    recordName: 'dev-live-talk',
    domainNameSsmParam: SSM_PARAMETERS.LIVETALK_CLOUDFRONT_DOMAIN_NAME('dev'),
    comment: 'LiveTalk (dev) ALIAS to CloudFront',
  },
  // Phase 1d: prod 用 `live-talk` レコードは prod CloudFront デプロイ後の Phase で追加。
  //   {
  //     recordName: 'live-talk',
  //     domainNameSsmParam: SSM_PARAMETERS.LIVETALK_CLOUDFRONT_DOMAIN_NAME('prod'),
  //     comment: 'LiveTalk (prod) ALIAS to CloudFront',
  //   },
];

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
 * ACM ワイルドカード証明書（*.nagiyu.com + nagiyu.com）の DNS 検証用 CNAME
 *
 * NS 切替前は XServer に同じ値が登録されていた。NS 切替後は世界中の
 * リゾルバが Route53 を見るため、証明書の自動更新時（有効期限の 60 日前）
 * に ACM が検証 CNAME を取得できるよう Route53 にも登録する。
 *
 * 値は AWS ACM コンソールまたは以下の AWS CLI で取得した実値:
 *   aws acm describe-certificate --certificate-arn $CERT_ARN \
 *     --query 'Certificate.DomainValidationOptions[*].ResourceRecord' \
 *     --region us-east-1
 *
 * 既存証明書の置換リスクを避けるため acm-stack.ts の validation には
 * 触らず、Route53 側に既存値を手動で複製する方針（plan.md の Phase 5
 * 案 A から案 B に変更）。
 */
const ACM_VALIDATION_CNAME = {
  recordName: '_795cd11835618eae1172367526630b7f',
  target: '_09095adf08f7ad2742324041fb053779.zfyfvmchrl.acm-validations.aws',
  comment: 'ACM DNS validation for *.nagiyu.com wildcard certificate',
};

/**
 * Phase 2 + Phase 5: 既存 XServer DNS レコードと ACM 検証 CNAME を
 * Route53 に複製するスタック
 *
 * - NS 切替（Phase 4）の前に、Route53 が XServer と同じ応答を返せる状態を作る
 * - すべての CloudFront 向けレコードは一旦 CNAME のまま複製（apex を除く）
 * - apex は Route53 の制約で CNAME 不可のため、最初から ALIAS で登録
 * - ACM 検証 CNAME は Phase 5 で Route53 に追加（証明書の置換リスクを
 *   避けるため、acm-stack.ts は変更せず既存検証値を手動で複製する方針）
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

    new route53.CnameRecord(this, 'CnameAcmValidation', {
      zone: hostedZone,
      recordName: ACM_VALIDATION_CNAME.recordName,
      domainName: ACM_VALIDATION_CNAME.target,
      ttl: RECORD_TTL,
      comment: ACM_VALIDATION_CNAME.comment,
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

    for (const spec of CLOUDFRONT_ALIAS_RECORDS) {
      const distributionDomain = ssm.StringParameter.valueForStringParameter(
        this,
        spec.domainNameSsmParam,
      );
      new route53.ARecord(this, `Alias${this.toPascalCase(spec.recordName)}`, {
        zone: hostedZone,
        recordName: spec.recordName,
        target: route53.RecordTarget.fromAlias({
          bind: () => ({
            dnsName: distributionDomain,
            hostedZoneId: CLOUDFRONT_HOSTED_ZONE_ID,
          }),
        }),
        comment: spec.comment,
      });
    }
  }

  private toPascalCase(value: string): string {
    return value
      .split('-')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join('');
  }
}
