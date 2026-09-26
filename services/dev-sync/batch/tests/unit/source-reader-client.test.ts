/**
 * source-reader-client（prod ソーステーブル読み取り用クライアント）の単体テスト
 *
 * AssumeRole・DynamoDB への実際のアクセスは発生しない
 * （`fromTemporaryCredentials` はクライアント生成時点では認証情報を取得しに行かず、
 * 実際に `send()` するまで遅延評価されるため、モック不要で安全に検証できる）。
 */

import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  getSourceReaderRoleArn,
  createSourceDynamoDBDocumentClient,
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

      expect(() => getSourceReaderRoleArn()).toThrow(
        ERROR_MESSAGES.SOURCE_READER_ROLE_ARN_MISSING
      );
    });

    it('SOURCE_READER_ROLE_ARN が空文字列の場合もエラーを投げる', () => {
      process.env.SOURCE_READER_ROLE_ARN = '';

      expect(() => getSourceReaderRoleArn()).toThrow(
        ERROR_MESSAGES.SOURCE_READER_ROLE_ARN_MISSING
      );
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
});
