export function getLambdaFunctionArn(region: string, account: string, name: string): string {
  return `arn:aws:lambda:${region}:${account}:function:${name}`;
}

export function getDynamoDBTableArn(region: string, account: string, name: string): string {
  return `arn:aws:dynamodb:${region}:${account}:table/${name}`;
}

export function getS3BucketArn(name: string): string {
  return `arn:aws:s3:::${name}`;
}

export function getEcrRepositoryArn(region: string, account: string, name: string): string {
  return `arn:aws:ecr:${region}:${account}:repository/${name}`;
}

export function getIamRoleArn(account: string, name: string): string {
  return `arn:aws:iam::${account}:role/${name}`;
}

export function getIamManagedPolicyArn(account: string, name: string): string {
  return `arn:aws:iam::${account}:policy/${name}`;
}

export function getSecretsManagerSecretArn(region: string, account: string, name: string): string {
  return `arn:aws:secretsmanager:${region}:${account}:secret:${name}-*`;
}

export function getEcsClusterArn(region: string, account: string, name: string): string {
  return `arn:aws:ecs:${region}:${account}:cluster/${name}`;
}
