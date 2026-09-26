/**
 * source-reader-client（prod ソーステーブル読み取り用クライアント）の単体テスト
 *
 * AssumeRole・DynamoDB への実際のアクセスは発生しない
 * （認証情報プロバイダはクライアント生成時点では呼ばれず、`send()` まで遅延評価される。
 * プロバイダ自体の検証では STS クライアントの `send` をモックする）。
 */

import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import {
  getSourceReaderRoleArn,
  createSourceDynamoDBDocumentClient,
  createAssumeRoleCredentialsProvider,
} from '../../src/lib/source-reader-client.js';
import { ERROR_MESSAGES } from '../../src/lib/errors.js';

describe('source-reader-client', () => {
  const originalRoleArn = process.env.SOURCE_READER_ROLE_ARN;
  const originalRegion = process.env.AWS_REGION;

  afterEach(() => {
    if (originalRoleArn === undefined) {
      delete process.env.SOURCE_READER_ROLE_ARN;
    } else {
      process.env.SOURCE_READER_ROLE_ARN = originalRoleArn;
    }
    if (originalRegion === undefined) {
      delete process.env.AWS_REGION;
    } else {
      process.env.AWS_REGION = originalRegion;
    }
  });

  describe('getSourceReaderRoleArn', () => {
    it('SOURCE_READER_ROLE_ARN が未設定の場合はエラーを投げる（同一アカウントへのフォールバックはしない）', () => {
      delete process.env.SOURCE_READER_ROLE_ARN;

      expect(() => getSourceReaderRoleArn()).toThrow(ERROR_MESSAGES.SOURCE_READER_ROLE_ARN_MISSING);
    });

    it('SOURCE_READER_ROLE_ARN が空文字列の場合もエラーを投げる', () => {
      process.env.SOURCE_READER_ROLE_ARN = '';

      expect(() => getSourceReaderRoleArn()).toThrow(ERROR_MESSAGES.SOURCE_READER_ROLE_ARN_MISSING);
    });

    it('SOURCE_READER_ROLE_ARN が設定されている場合はその値を返す', () => {
      process.env.SOURCE_READER_ROLE_ARN =
        'arn:aws:iam::166562222746:role/nagiyu-dev-sync-source-reader';

      expect(getSourceReaderRoleArn()).toBe(
        'arn:aws:iam::166562222746:role/nagiyu-dev-sync-source-reader'
      );
    });
  });

  describe('createSourceDynamoDBDocumentClient', () => {
    it('SOURCE_READER_ROLE_ARN が未設定の場合はエラーを投げる', () => {
      delete process.env.SOURCE_READER_ROLE_ARN;

      expect(() => createSourceDynamoDBDocumentClient()).toThrow(
        ERROR_MESSAGES.SOURCE_READER_ROLE_ARN_MISSING
      );
    });

    it('SOURCE_READER_ROLE_ARN が設定されている場合は DynamoDBDocumentClient を生成する', () => {
      process.env.SOURCE_READER_ROLE_ARN =
        'arn:aws:iam::166562222746:role/nagiyu-dev-sync-source-reader';

      const client = createSourceDynamoDBDocumentClient();

      expect(client).toBeInstanceOf(DynamoDBDocumentClient);
    });

    it('region 省略時・AWS_REGION 未設定時も既定リージョンでクライアントを生成できる', () => {
      process.env.SOURCE_READER_ROLE_ARN =
        'arn:aws:iam::166562222746:role/nagiyu-dev-sync-source-reader';
      delete process.env.AWS_REGION;

      expect(() => createSourceDynamoDBDocumentClient()).not.toThrow();
    });

    it('region を明示指定した場合もクライアントを生成できる', () => {
      process.env.SOURCE_READER_ROLE_ARN =
        'arn:aws:iam::166562222746:role/nagiyu-dev-sync-source-reader';

      expect(() => createSourceDynamoDBDocumentClient('ap-northeast-1')).not.toThrow();
    });
  });

  describe('createAssumeRoleCredentialsProvider', () => {
    const roleArn = 'arn:aws:iam::166562222746:role/nagiyu-dev-sync-source-reader';

    it('指定ロールを AssumeRole し、一時認証情報を返す', async () => {
      const expiration = new Date('2026-01-01T00:00:00Z');
      const stsClient = new STSClient({ region: 'us-east-1' });
      const sendSpy = jest.spyOn(stsClient, 'send').mockResolvedValue({
        Credentials: {
          AccessKeyId: 'AKIA_TEST',
          SecretAccessKey: 'secret',
          SessionToken: 'token',
          Expiration: expiration,
        },
      } as never);

      const credentials = await createAssumeRoleCredentialsProvider(roleArn, stsClient)();

      expect(credentials).toEqual({
        accessKeyId: 'AKIA_TEST',
        secretAccessKey: 'secret',
        sessionToken: 'token',
        expiration,
      });
      const command = sendSpy.mock.calls[0][0] as AssumeRoleCommand;
      expect(command).toBeInstanceOf(AssumeRoleCommand);
      expect(command.input).toEqual({
        RoleArn: roleArn,
        RoleSessionName: 'nagiyu-dev-sync',
      });
    });

    it('認証情報が返らない場合はエラーを投げる', async () => {
      const stsClient = new STSClient({ region: 'us-east-1' });
      jest.spyOn(stsClient, 'send').mockResolvedValue({} as never);

      await expect(createAssumeRoleCredentialsProvider(roleArn, stsClient)()).rejects.toThrow(
        ERROR_MESSAGES.SOURCE_READER_ASSUME_ROLE_FAILED
      );
    });
  });
});
