import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { ACCOUNT_IDS } from '../account-scope';

/** Claude Code on the web 用の IAM ロール名（dev/prod 両アカウント共通の固定値） */
export const CLAUDE_ROLE_NAME = 'nagiyu-claude';

/** Claude Code on the web のキー保持ユーザー名（prod アカウントにのみ作成する固定値） */
export const CLAUDE_KEY_USER_NAME = 'nagiyu-claude-key';

export interface IamClaudeAccessStackProps extends cdk.StackProps {
  /** 既存の閲覧専用ポリシー（`IamClaudeReadonlyPolicyStack.policy`） */
  readonlyPolicy: iam.IManagedPolicy;
  /**
   * dev アカウント操作用に実行を許可する Lambda 関数名。
   * 空配列なら追加ポリシー（`nagiyu-claude-dev-operations-policy`）自体を作らない。
   */
  invokableFunctionNames: string[];
  /** キー保持ユーザー（`nagiyu-claude-key`）を作成するかどうか（prod アカウントのみ true） */
  createKeyUser: boolean;
}

/**
 * IAM Claude Access Stack
 *
 * Claude Code on the web が dev/prod 両アカウントへアクセスするための IAM ロール
 * `nagiyu-claude` と、そのロールを引き受けるキー保持ユーザー `nagiyu-claude-key`
 * （prod アカウントにのみ作成）を管理する（Issue #3861）。
 *
 * 旧 `IamUsersStack`（`nagiyu-claude-readonly` ユーザー）・
 * `IamClaudeReadonlyPolicyStack`（`nagiyu-claude-readonly-policy`）には手を加えず、
 * 切り替え完了を確認してから別 PR で撤去する方針のため、本スタックとは意図的に
 * 並存させている。
 *
 * dev/prod でスタックの構造自体は同一とし、差分は props（readonlyPolicy /
 * invokableFunctionNames / createKeyUser）だけで表現する
 * （スタック内で accountScope による分岐は書かない）。
 */
export class IamClaudeAccessStack extends cdk.Stack {
  public readonly role: iam.IRole;
  public readonly keyUser?: iam.IUser;

  constructor(scope: Construct, id: string, props: IamClaudeAccessStackProps) {
    super(scope, id, props);

    const keyUserArn = `arn:aws:iam::${ACCOUNT_IDS.prod}:user/${CLAUDE_KEY_USER_NAME}`;

    // ==========================================
    // nagiyu-claude ロール（dev/prod 両アカウントに作成）
    // ==========================================
    // 信頼先は prod アカウントの nagiyu-claude-key ユーザーのみ。
    // IAM は存在しないユーザーを Principal に直接書くと作成時にエラーになり、
    // dev アカウントのこのロールは prod アカウントの nagiyu-claude-key ユーザーより
    // 先にデプロイされうるため、アカウントプリンシパル + aws:PrincipalArn 条件にする
    // （`DevSyncSourceReaderStack` と同じ考え方）。
    // 将来 Claude 側が OIDC プロバイダへ信頼先を差し替える場合も、この信頼ポリシー
    // だけの変更で済む（参考: anthropics/claude-code#81502）。
    this.role = new iam.Role(this, 'ClaudeRole', {
      roleName: CLAUDE_ROLE_NAME,
      assumedBy: new iam.AccountPrincipal(ACCOUNT_IDS.prod).withConditions({
        ArnEquals: {
          'aws:PrincipalArn': keyUserArn,
        },
      }),
      managedPolicies: [props.readonlyPolicy],
    });

    // dev アカウント操作用の追加ポリシー。
    // 基準は「実行は可、何が実行されるかの変更は不可」。
    // lambda:InvokeFunction のみを、列挙した関数（+ バージョン/エイリアス修飾付き ARN）に
    // 限定して許可し、UpdateFunctionCode / UpdateFunctionConfiguration・iam:*・
    // PassRole・sts:AssumeRole は一切付与しない（dev-sync Lambda のロール経由で
    // prod テーブルへ届く経路があるため）。対象関数自体も、外部の有料 API・外部送信・
    // prod へのアクセスを伴わず dev 内で完結するものに限定している。
    if (props.invokableFunctionNames.length > 0) {
      const invokeResources = props.invokableFunctionNames.flatMap((functionName) => {
        const functionArn = `arn:aws:lambda:us-east-1:${this.account}:function:${functionName}`;
        // バージョン/エイリアス修飾付き呼び出し（`:1` `:live` 等）も許可する
        return [functionArn, `${functionArn}:*`];
      });

      const operationsPolicy = new iam.ManagedPolicy(this, 'ClaudeDevOperationsPolicy', {
        managedPolicyName: 'nagiyu-claude-dev-operations-policy',
        description:
          'Claude Code on the web が dev アカウントで Lambda を実行するための権限（InvokeFunction のみ）',
        statements: [
          new iam.PolicyStatement({
            sid: 'AllowInvokeSpecificFunctions',
            effect: iam.Effect.ALLOW,
            actions: ['lambda:InvokeFunction'],
            resources: invokeResources,
          }),
        ],
      });

      this.role.addManagedPolicy(operationsPolicy);
    }

    new cdk.CfnOutput(this, 'ClaudeRoleArnExport', {
      value: this.role.roleArn,
      description: 'Claude role ARN (nagiyu-claude)',
    });

    // ==========================================
    // nagiyu-claude-key ユーザー（prod アカウントにのみ作成）
    // ==========================================
    // 身元は届くアカウントのうち最も信頼度の高い prod に置き、信頼は
    // 常に prod → dev の一方向にする。dev 側に身元を置くと、dev で IAM を
    // 操作できる主体（PR からも引き受けられる dev の OIDC ロールは
    // iam:CreateAccessKey を含む）が prod を閲覧できるようになってしまう。
    // アクセスキー自体はこのスタックでは作成せず、人が手動発行する。
    if (props.createKeyUser) {
      const assumableRoleArns = (Object.keys(ACCOUNT_IDS) as (keyof typeof ACCOUNT_IDS)[]).map(
        (scope) => `arn:aws:iam::${ACCOUNT_IDS[scope]}:role/${CLAUDE_ROLE_NAME}`
      );

      this.keyUser = new iam.User(this, 'ClaudeKeyUser', {
        userName: CLAUDE_KEY_USER_NAME,
      });

      // 権限は両アカウントの nagiyu-claude ロールへの AssumeRole のみ。他の権限は付与しない。
      this.keyUser.addToPrincipalPolicy(
        new iam.PolicyStatement({
          sid: 'AllowAssumeClaudeRole',
          effect: iam.Effect.ALLOW,
          actions: ['sts:AssumeRole'],
          resources: assumableRoleArns,
        })
      );

      new cdk.CfnOutput(this, 'ClaudeKeyUserArnExport', {
        value: this.keyUser.userArn,
        description: 'Claude key user ARN (nagiyu-claude-key)',
      });

      new cdk.CfnOutput(this, 'ClaudeKeyUserNameExport', {
        value: this.keyUser.userName,
        description: 'Claude key user name (nagiyu-claude-key)',
      });
    }
  }
}
