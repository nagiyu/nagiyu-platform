import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface IAMStackProps extends cdk.StackProps {
  environment: string;
  webRuntimePolicy: iam.IManagedPolicy;
}

export class IAMStack extends cdk.Stack {
  public readonly devUser?: iam.IUser;

  constructor(scope: Construct, id: string, props: IAMStackProps) {
    super(scope, id, props);

    const { environment, webRuntimePolicy } = props;

    if (environment === 'dev') {
      this.devUser = new iam.User(this, 'DevUser', {
        userName: 'share-together-dev',
        managedPolicies: [webRuntimePolicy],
      });

      new cdk.CfnOutput(this, 'DevUserName', {
        value: this.devUser.userName,
        description: 'Development IAM User Name',
      });

      new cdk.CfnOutput(this, 'DevUserArn', {
        value: this.devUser.userArn,
        description: 'Development IAM User ARN',
      });
    }
  }
}
