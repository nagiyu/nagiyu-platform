/**
 * job-environment.ts のユニットテスト
 */

import { getJobParameters, readEnvironmentVariables } from '../../src/lib/job-environment';

const ENV_KEYS = [
  'DYNAMODB_TABLE_NAME',
  'AWS_REGION',
  'ENCRYPTION_SECRET_NAME',
  'SHARED_SECRET_KEY',
  'NODE_ENV',
  'USER_ID',
  'VIDEO_IDS',
  'MYLIST_NAME',
  'ENCRYPTED_USER_SESSION',
  'AWS_BATCH_JOB_ID',
] as const;

describe('job-environment', () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
    jest.restoreAllMocks();
  });

  describe('readEnvironmentVariables', () => {
    beforeEach(() => {
      process.env.DYNAMODB_TABLE_NAME = 'test-table';
      process.env.AWS_REGION = 'ap-northeast-1';
    });

    it('ジョブ定義の値を読み取る', () => {
      process.env.ENCRYPTION_SECRET_NAME = 'secret-name';
      process.env.NODE_ENV = 'production';

      expect(readEnvironmentVariables()).toEqual({
        dynamodbTableName: 'test-table',
        encryptionSecretName: 'secret-name',
        awsRegion: 'ap-northeast-1',
        nodeEnv: 'production',
      });
    });

    it.each(['DYNAMODB_TABLE_NAME', 'AWS_REGION'])('%s が未設定のときは例外を投げる', (key) => {
      delete process.env[key];

      expect(() => readEnvironmentVariables()).toThrow(key);
    });

    it('ENCRYPTION_SECRET_NAME が無ければ SHARED_SECRET_KEY にフォールバックする', () => {
      process.env.SHARED_SECRET_KEY = 'shared-secret';

      expect(readEnvironmentVariables().encryptionSecretName).toBe('shared-secret');
    });

    it('ENCRYPTION_SECRET_NAME と SHARED_SECRET_KEY の両方があれば前者を優先する', () => {
      process.env.ENCRYPTION_SECRET_NAME = 'secret-name';
      process.env.SHARED_SECRET_KEY = 'shared-secret';

      expect(readEnvironmentVariables().encryptionSecretName).toBe('secret-name');
    });

    it('暗号化キー名がどちらも無ければ空文字、NODE_ENV が無ければ development になる', () => {
      const env = readEnvironmentVariables();

      expect(env.encryptionSecretName).toBe('');
      expect(env.nodeEnv).toBe('development');
    });
  });

  describe('getJobParameters', () => {
    beforeEach(() => {
      process.env.USER_ID = 'user-1';
      process.env.VIDEO_IDS = '["sm1","sm2"]';
      process.env.MYLIST_NAME = 'マイリスト';
      process.env.ENCRYPTED_USER_SESSION = '{"ciphertext":"c"}';
      process.env.AWS_BATCH_JOB_ID = 'batch-job-1';
    });

    it('web からの入力と AWS_BATCH_JOB_ID を読み取る', () => {
      expect(getJobParameters()).toEqual({
        jobId: 'batch-job-1',
        userId: 'user-1',
        videoIds: ['sm1', 'sm2'],
        mylistName: 'マイリスト',
        encryptedUserSession: '{"ciphertext":"c"}',
      });
    });

    it('MYLIST_NAME が空のときは既定のプレフィックス付きの名前になる', () => {
      process.env.MYLIST_NAME = '';

      expect(getJobParameters().mylistName).toMatch(/^自動登録 .+/);
    });

    it('AWS_BATCH_JOB_ID が無いときは警告して jobId を空にする', () => {
      delete process.env.AWS_BATCH_JOB_ID;

      expect(getJobParameters().jobId).toBe('');
      expect(console.warn).toHaveBeenCalled();
    });

    it('入力が不正なときは例外を投げる', () => {
      delete process.env.USER_ID;

      expect(() => getJobParameters()).toThrow('ジョブパラメータが不正です');
    });
  });
});
