import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface LambdaStackProps extends cdk.StackProps {
  environment: string;
}

export class LambdaStack extends cdk.Stack {
  public readonly functionUrl: lambda.FunctionUrl;

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    const webFunction = new lambda.Function(this, 'WebFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(
        "exports.handler = async () => ({ statusCode: 200, headers: {'content-type':'application/json'}, body: JSON.stringify({service:'quick-clip', status:'ok'}) });"
      ),
    });

    this.functionUrl = webFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });

    new cdk.CfnOutput(this, 'FunctionUrl', {
      value: this.functionUrl.url,
    });
  }
}
