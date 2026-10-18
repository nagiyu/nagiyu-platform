/**
 * DynamoDB NiconicoCredential Repository のユニットテスト
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { DynamoDBNiconicoCredentialRepository } from '../../../src/repositories/dynamodb-niconico-credential.repository.js';
import { DatabaseError, EntityNotFoundError } from '@nagiyu/aws';
import type { CreateNiconicoCredentialInput } from '../../../src/entities/niconico-credential.entity.js';
import { NICONICO_CREDENTIAL_SK } from '../../../src/entities/niconico-credential.entity.js';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('DynamoDBNiconicoCredentialRepository', () => {
  let repository: DynamoDBNiconicoCredentialRepository;
  const tableName = 'test-table';

  const sampleEncryptedBlob = JSON.stringify({
    ciphertext: 'dummyCiphertext',
    iv: 'dummyIv',
    authTag: 'dummyAuthTag',
  });

  const sampleItem = {
    PK: 'USER#user-123',
    SK: NICONICO_CREDENTIAL_SK,
    Type: 'NICONICO_CREDENTIAL',
    UserID: 'user-123',
    EncryptedUserSession: sampleEncryptedBlob,
    AcquiredAt: 1700000000000,
    EstimatedExpiresAt: 1702592000000,
    CreatedAt: 1700000000000,
    UpdatedAt: 1700000000000,
  };

  const sampleInput: CreateNiconicoCredentialInput = {
    userId: 'user-123',
    encryptedUserSession: sampleEncryptedBlob,
    acquiredAt: 1700000000000,
    estimatedExpiresAt: 1702592000000,
  };

  beforeEach(() => {
    ddbMock.reset();
    repository = new DynamoDBNiconicoCredentialRepository(
      ddbMock as unknown as DynamoDBDocumentClient,
      tableName
    );
  });

  describe('getByUserId', () => {
    it('保存済み資格情報を取得できる', async () => {
      ddbMock.on(GetCommand).resolves({ Item: sampleItem });

      expect(await repository.getByUserId('user-123')).toEqual(sampleInput);
    });

    it('旧属性名 (camelCase) のアイテムも取得できる', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          PK: 'USER#user-123',
          SK: NICONICO_CREDENTIAL_SK,
          Type: 'NICONICO_CREDENTIAL',
          userId: 'user-123',
          encryptedUserSession: sampleEncryptedBlob,
          acquiredAt: 1700000000000,
          estimatedExpiresAt: 1702592000000,
          CreatedAt: 1700000000000,
          UpdatedAt: 1700000000000,
        },
      });

      expect(await repository.getByUserId('user-123')).toEqual(sampleInput);
    });

    it('存在しない場合は null を返す', async () => {
      ddbMock.on(GetCommand).resolves({});

      expect(await repository.getByUserId('user-nonexistent')).toBeNull();
    });

    it('正しい PK/SK で GetCommand を呼び出す', async () => {
      ddbMock.on(GetCommand).resolves({});

      await repository.getByUserId('user-123');

      const calls = ddbMock.commandCalls(GetCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input.Key).toEqual({
        PK: 'USER#user-123',
        SK: NICONICO_CREDENTIAL_SK,
      });
    });

    it('DynamoDB エラーの場合は DatabaseError をスローする', async () => {
      ddbMock.on(GetCommand).rejects(new Error('DynamoDB error'));

      await expect(repository.getByUserId('user-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('upsert', () => {
    it('資格情報を保存できる', async () => {
      ddbMock.on(PutCommand).resolves({});

      expect(await repository.upsert(sampleInput)).toEqual(sampleInput);
    });

    it('PascalCase の属性名で保存し、CreatedAt には acquiredAt を書く', async () => {
      ddbMock.on(PutCommand).resolves({});

      await repository.upsert(sampleInput);

      const calls = ddbMock.commandCalls(PutCommand);
      expect(calls).toHaveLength(1);

      const putInput = calls[0].args[0].input;
      expect(putInput.TableName).toBe(tableName);
      expect(putInput.Item).toMatchObject({
        PK: 'USER#user-123',
        SK: NICONICO_CREDENTIAL_SK,
        Type: 'NICONICO_CREDENTIAL',
        UserID: 'user-123',
        EncryptedUserSession: sampleEncryptedBlob,
        AcquiredAt: 1700000000000,
        EstimatedExpiresAt: 1702592000000,
        CreatedAt: 1700000000000,
        UpdatedAt: expect.any(Number),
      });
      for (const legacyName of ['userId', 'encryptedUserSession', 'acquiredAt']) {
        expect(putInput.Item).not.toHaveProperty(legacyName);
      }
    });

    it('条件式なしで upsert する', async () => {
      ddbMock.on(PutCommand).resolves({});

      await repository.upsert(sampleInput);

      expect(ddbMock.commandCalls(PutCommand)[0].args[0].input.ConditionExpression).toBeUndefined();
    });

    it('DynamoDB エラーの場合は DatabaseError をスローする', async () => {
      ddbMock.on(PutCommand).rejects(new Error('DynamoDB error'));

      await expect(repository.upsert(sampleInput)).rejects.toThrow(DatabaseError);
    });
  });

  describe('delete', () => {
    it('存在を条件に資格情報を削除できる', async () => {
      ddbMock.on(DeleteCommand).resolves({});

      await expect(repository.delete('user-123')).resolves.toBeUndefined();

      const input = ddbMock.commandCalls(DeleteCommand)[0].args[0].input;
      expect(input.Key).toEqual({ PK: 'USER#user-123', SK: NICONICO_CREDENTIAL_SK });
      expect(input.ConditionExpression).toContain('attribute_exists');
    });

    it('存在しない資格情報を削除すると EntityNotFoundError をスローする', async () => {
      const error = new Error('ConditionalCheckFailedException');
      error.name = 'ConditionalCheckFailedException';
      ddbMock.on(DeleteCommand).rejects(error);

      await expect(repository.delete('user-123')).rejects.toThrow(EntityNotFoundError);
    });

    it('DynamoDB エラーの場合は DatabaseError をスローする', async () => {
      ddbMock.on(DeleteCommand).rejects(new Error('DynamoDB error'));

      await expect(repository.delete('user-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('deleteIfExists', () => {
    it('対象がなくても成功し、存在を条件にしない', async () => {
      ddbMock.on(DeleteCommand).resolves({});

      await expect(repository.deleteIfExists('user-123')).resolves.toBeUndefined();

      const input = ddbMock.commandCalls(DeleteCommand)[0].args[0].input;
      expect(input.Key).toEqual({ PK: 'USER#user-123', SK: NICONICO_CREDENTIAL_SK });
      expect(input).not.toHaveProperty('ConditionExpression');
    });

    it('DynamoDB エラーの場合は DatabaseError をスローする', async () => {
      ddbMock.on(DeleteCommand).rejects(new Error('DynamoDB error'));

      await expect(repository.deleteIfExists('user-123')).rejects.toThrow(DatabaseError);
    });
  });
});
