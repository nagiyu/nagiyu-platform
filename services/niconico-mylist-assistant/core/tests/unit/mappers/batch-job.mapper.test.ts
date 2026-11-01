/**
 * BatchJob Mapper のテスト
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { InvalidEntityDataError, REMOVE_ATTRIBUTE, TTL_ATTRIBUTE_NAME } from '@nagiyu/aws';
import { BatchJobMapper } from '../../../src/mappers/batch-job.mapper.js';
import type { BatchJobEntity } from '../../../src/entities/batch-job.entity.js';

const CREATED_AT = 1704067200000;
const UPDATED_AT = 1704067260000;
const COMPLETED_AT = 1704067300000;
const KEY = { jobId: 'job-1', userId: 'user-1' };
const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

const PUSH_SUBSCRIPTION = {
  endpoint: 'https://push.example.com/abc',
  keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
};
const RESULT = { registeredCount: 3, failedCount: 1, totalCount: 4, errorMessage: '一部失敗' };

function buildEntity(overrides: Partial<BatchJobEntity> = {}): BatchJobEntity {
  return {
    jobId: 'job-1',
    userId: 'user-1',
    status: 'SUBMITTED',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'USER#user-1',
    SK: 'BATCH_JOB#job-1',
    Type: 'BATCH_JOB',
    JobID: 'job-1',
    UserID: 'user-1',
    Status: 'SUBMITTED',
    CreatedAt: CREATED_AT,
    UpdatedAt: UPDATED_AT,
    TTL: Math.floor(CREATED_AT / 1000) + SEVEN_DAYS_SECONDS,
    ...overrides,
  };
}

describe('BatchJobMapper', () => {
  let mapper: BatchJobMapper;

  beforeEach(() => {
    mapper = new BatchJobMapper();
  });

  it('entityType は BATCH_JOB になる', () => {
    expect(mapper.entityType).toBe('BATCH_JOB');
  });

  it('新属性名に対する旧属性名 (camelCase) を宣言する', () => {
    expect(mapper.legacyAttributeNames).toEqual({
      JobID: ['jobId'],
      UserID: ['userId'],
      Status: ['status'],
      Result: ['result'],
      TwoFactorAuthCode: ['twoFactorAuthCode'],
      PushSubscription: ['pushSubscription'],
    });
  });

  describe('buildKeys / getKey', () => {
    it('ビジネスキーから PK/SK を構築できる', () => {
      expect(mapper.buildKeys(KEY)).toEqual({ PK: 'USER#user-1', SK: 'BATCH_JOB#job-1' });
    });

    it('PK が先頭のキー属性になる', () => {
      expect(Object.keys(mapper.buildKeys(KEY))).toEqual(['PK', 'SK']);
    });

    it('Entity からビジネスキーを取り出せる', () => {
      expect(mapper.getKey(buildEntity())).toEqual(KEY);
    });
  });

  describe('toItem', () => {
    it('Entity を PascalCase の属性名の Item に変換する', () => {
      expect(mapper.toItem(buildEntity())).toEqual(buildItem());
    });

    it('任意項目を PascalCase で保存し、ネストしたキーは変えない', () => {
      const item = mapper.toItem(
        buildEntity({
          status: 'WAITING_FOR_2FA',
          result: RESULT,
          completedAt: COMPLETED_AT,
          twoFactorAuthCode: '123456',
          pushSubscription: PUSH_SUBSCRIPTION,
        })
      );

      expect(item).toMatchObject({
        Status: 'WAITING_FOR_2FA',
        Result: RESULT,
        CompletedAt: COMPLETED_AT,
        TwoFactorAuthCode: '123456',
        PushSubscription: PUSH_SUBSCRIPTION,
      });
    });

    it('任意項目がなければ属性を書かない', () => {
      const item = mapper.toItem(buildEntity());

      for (const name of ['Result', 'CompletedAt', 'TwoFactorAuthCode', 'PushSubscription']) {
        expect(item).not.toHaveProperty(name);
      }
    });

    it('旧属性名は書かない', () => {
      const item = mapper.toItem(
        buildEntity({
          result: RESULT,
          twoFactorAuthCode: '123456',
          pushSubscription: PUSH_SUBSCRIPTION,
        })
      );

      for (const legacyName of [
        'jobId',
        'userId',
        'status',
        'result',
        'twoFactorAuthCode',
        'pushSubscription',
      ]) {
        expect(item).not.toHaveProperty(legacyName);
      }
    });

    it('TTL は createdAt の 7 日後をエポック秒で書く', () => {
      const item = mapper.toItem(buildEntity({ createdAt: 1704067200999 }));

      expect(TTL_ATTRIBUTE_NAME).toBe('TTL');
      expect(item.TTL).toBe(Math.floor(1704067200999 / 1000) + SEVEN_DAYS_SECONDS);
    });

    it('toItem のキー属性は buildKeys の結果と一致する', () => {
      const item = mapper.toItem(buildEntity());

      for (const [name, value] of Object.entries(mapper.buildKeys(KEY))) {
        expect(item[name]).toBe(value);
      }
    });
  });

  describe('toEntity', () => {
    it('新属性名の Item を Entity に変換できる', () => {
      expect(mapper.toEntity(buildItem())).toEqual(buildEntity());
    });

    it('任意項目を読める', () => {
      const entity = mapper.toEntity(
        buildItem({
          Result: RESULT,
          CompletedAt: COMPLETED_AT,
          TwoFactorAuthCode: '123456',
          PushSubscription: PUSH_SUBSCRIPTION,
        })
      );

      expect(entity).toEqual(
        buildEntity({
          result: RESULT,
          completedAt: COMPLETED_AT,
          twoFactorAuthCode: '123456',
          pushSubscription: PUSH_SUBSCRIPTION,
        })
      );
    });

    it('旧属性名 (camelCase) の Item も読める', () => {
      const entity = mapper.toEntity({
        PK: 'USER#user-1',
        SK: 'BATCH_JOB#job-1',
        Type: 'BATCH_JOB',
        jobId: 'job-1',
        userId: 'user-1',
        status: 'SUCCEEDED',
        result: RESULT,
        twoFactorAuthCode: '654321',
        pushSubscription: PUSH_SUBSCRIPTION,
        CreatedAt: CREATED_AT,
        UpdatedAt: UPDATED_AT,
        CompletedAt: COMPLETED_AT,
        TTL: 1,
      });

      expect(entity).toEqual(
        buildEntity({
          status: 'SUCCEEDED',
          result: RESULT,
          completedAt: COMPLETED_AT,
          twoFactorAuthCode: '654321',
          pushSubscription: PUSH_SUBSCRIPTION,
        })
      );
    });

    it('新旧の属性名が併存するときは新名を優先する', () => {
      const entity = mapper.toEntity(
        buildItem({
          Status: 'RUNNING',
          status: 'FAILED',
          TwoFactorAuthCode: '111111',
          twoFactorAuthCode: '222222',
        })
      );

      expect(entity.status).toBe('RUNNING');
      expect(entity.twoFactorAuthCode).toBe('111111');
    });

    it.each(['JobID', 'UserID', 'Status', 'CreatedAt', 'UpdatedAt'])(
      '必須属性 %s が欠けていると InvalidEntityDataError になる',
      (name) => {
        const item = buildItem();
        delete item[name];

        expect(() => mapper.toEntity(item)).toThrow(InvalidEntityDataError);
      }
    );

    it('定義にないステータスは InvalidEntityDataError になる', () => {
      expect(() => mapper.toEntity(buildItem({ Status: 'UNKNOWN' }))).toThrow(
        InvalidEntityDataError
      );
    });

    it('不正な CompletedAt は InvalidEntityDataError になる', () => {
      expect(() => mapper.toEntity(buildItem({ CompletedAt: 'invalid' }))).toThrow(
        InvalidEntityDataError
      );
    });

    it('オブジェクトでない Result は InvalidEntityDataError になる', () => {
      expect(() => mapper.toEntity(buildItem({ Result: 'x' }))).toThrow(InvalidEntityDataError);
      expect(() => mapper.toEntity(buildItem({ Result: [] }))).toThrow(InvalidEntityDataError);
    });

    it('文字列でない TwoFactorAuthCode は InvalidEntityDataError になる', () => {
      expect(() => mapper.toEntity(buildItem({ TwoFactorAuthCode: 123456 }))).toThrow(
        InvalidEntityDataError
      );
    });

    it.each([
      ['オブジェクトでない', 'invalid'],
      ['配列', []],
      ['keys がない', { endpoint: 'https://push.example.com/abc' }],
      ['keys が配列', { endpoint: 'https://push.example.com/abc', keys: [] }],
      ['keys が null', { endpoint: 'https://push.example.com/abc', keys: null }],
      ['keys が文字列', { endpoint: 'https://push.example.com/abc', keys: 'x' }],
      ['endpoint がない', { keys: { p256dh: 'a', auth: 'b' } }],
      ['p256dh がない', { endpoint: 'https://push.example.com/abc', keys: { auth: 'b' } }],
      ['auth がない', { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'a' } }],
    ])('PushSubscription が不正 (%s) だと InvalidEntityDataError になる', (_label, value) => {
      expect(() => mapper.toEntity(buildItem({ PushSubscription: value }))).toThrow(
        InvalidEntityDataError
      );
    });
  });

  describe('toUpdateAttributes', () => {
    it('変更された項目だけを保存用の属性名で返す', () => {
      const attributes = mapper.toUpdateAttributes({
        status: 'SUCCEEDED',
        result: RESULT,
        completedAt: COMPLETED_AT,
      });

      expect(attributes.Status).toBe('SUCCEEDED');
      expect(attributes.Result).toEqual(RESULT);
      expect(attributes.CompletedAt).toBe(COMPLETED_AT);
      expect(attributes.TwoFactorAuthCode).toBeUndefined();
      expect(attributes.PushSubscription).toBeUndefined();
    });

    it('TTL は書き換えない', () => {
      const attributes = mapper.toUpdateAttributes({ status: 'RUNNING' });

      expect(attributes).not.toHaveProperty('TTL');
      expect(attributes.TTL).toBeUndefined();
    });

    it.each([
      ['result', 'Result'],
      ['completedAt', 'CompletedAt'],
      ['twoFactorAuthCode', 'TwoFactorAuthCode'],
      ['pushSubscription', 'PushSubscription'],
    ] as const)('任意項目 %s は null で属性の削除になる', (field, attribute) => {
      expect(mapper.toUpdateAttributes({ [field]: null })[attribute]).toBe(REMOVE_ATTRIBUTE);
    });

    it('必須項目 status に null を渡すと InvalidEntityDataError になる', () => {
      expect(() => mapper.toUpdateAttributes({ status: null })).toThrow(InvalidEntityDataError);
    });

    it.each([
      ['jobId', 'job-1'],
      ['userId', 'user-1'],
      ['createdAt', 1],
    ] as const)('変更できない項目 %s を含めると InvalidEntityDataError になる', (field, value) => {
      expect(() => mapper.toUpdateAttributes({ [field]: value })).toThrow(InvalidEntityDataError);
    });
  });
});
