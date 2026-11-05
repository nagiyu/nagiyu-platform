import * as cdk from 'aws-cdk-lib';
import { importSharedVpc } from '../../src/utils/vpc';

describe('importSharedVpc', () => {
  const setup = (environment: 'dev' | 'prod') => {
    const stack = new cdk.Stack();
    const result = importSharedVpc(stack, 'SharedVpc', environment);
    return { stack, result };
  };

  it.each(['dev', 'prod'] as const)('%s でも 2 つの AZ とサブネットを持つ VPC を返す', (env) => {
    const { result } = setup(env);

    expect(result.vpc.availabilityZones).toEqual(['us-east-1a', 'us-east-1b']);
    expect(result.vpc.publicSubnets).toHaveLength(2);
  });

  it('環境ごとの SSM パラメータを参照する', () => {
    const { stack, result } = setup('dev');

    expect(JSON.stringify(stack.resolve(result.vpc.vpcId))).toContain('nagiyushareddevvpcid');
    expect(JSON.stringify(stack.resolve(result.publicSubnetIds))).toContain(
      'nagiyushareddevvpcpublicsubnetids'
    );
  });

  it('publicSubnetIds は Fn.split の結果をそのまま返す', () => {
    const { stack, result } = setup('prod');

    const resolved = stack.resolve(result.publicSubnetIds);
    expect(resolved).toHaveProperty('Fn::Split');
    expect(resolved['Fn::Split'][0]).toBe(',');
  });

  it('サブネット ID は Fn.select で 0 番目と 1 番目を参照する', () => {
    const { stack, result } = setup('prod');

    const resolved = result.vpc.publicSubnets.map((s) => stack.resolve(s.subnetId));
    expect(resolved.map((r) => r['Fn::Select'][0])).toEqual([0, 1]);
  });
});
