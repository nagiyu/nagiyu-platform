import { describe, it, expect, beforeEach } from '@jest/globals';
import { getLambdaClient, clearLambdaClientCache } from '../../../src/lambda/client.js';

describe('Lambda Client', () => {
  beforeEach(() => {
    clearLambdaClientCache();
    delete process.env.AWS_REGION;
  });

  it('同一リージョンではシングルトンを返す', () => {
    const first = getLambdaClient('ap-northeast-1');
    const second = getLambdaClient('ap-northeast-1');

    expect(first).toBe(second);
  });

  it('リージョンが異なる場合は別インスタンスを返す', () => {
    const first = getLambdaClient('ap-northeast-1');
    const second = getLambdaClient('us-east-1');

    expect(first).not.toBe(second);
  });

  it('キャッシュクリア後は新しいインスタンスを返す', () => {
    const first = getLambdaClient('ap-northeast-1');
    clearLambdaClientCache();
    const second = getLambdaClient('ap-northeast-1');

    expect(first).not.toBe(second);
  });

  it('リージョン未指定時は AWS_REGION 環境変数を使用する', () => {
    process.env.AWS_REGION = 'eu-west-1';
    const client1 = getLambdaClient();
    const client2 = getLambdaClient('eu-west-1');

    expect(client1).toBe(client2);
  });

  it('AWS_REGION 未設定時はデフォルトの us-east-1 を使用する', () => {
    const client1 = getLambdaClient();
    const client2 = getLambdaClient('us-east-1');

    expect(client1).toBe(client2);
  });
});
