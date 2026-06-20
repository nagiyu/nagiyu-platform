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
import { DatabaseError } from '@nagiyu/aws';
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
    userId: 'user-123',
    encryptedUserSession: sampleEncryptedBlob,
    acquiredAt: 1700000000000,
    estimatedExpiresAt: 1702592000000,
  };

  const sampleInput: CreateNiconicoCredentialInput = {
    userId: 'user-123',
    encryptedUserSession: sampleEncryptedBlob,
    acquiredAt: 1700000000000,
    estimatedExpiresAt: 1702592000000,
  };

  beforeEach(() => {
    ddbMock.reset();
    const docClient = ddbMock as unknown as DynamoDBDocumentClient;
    repository = new DynamoDBNiconicoCredentialRepository(docClient, tableName);
  });

  describe('getByUserId', () => {
    it('保存済み資格情報を取得できる', async () => {
      ddbMock.on(GetCommand).resolves({ Item: sampleItem });

      const result = await repository.getByUserId('user-123');

      expect(result).not.toBeNull();
      expect(result?.userId).toBe('user-123');
      expect(result?.encryptedUserSession).toBe(sampleEncryptedBlob);
      expect(result?.acquiredAt).toBe(1700000000000);
      expect(result?.estimatedExpiresAt).toBe(1702592000000);
    });

    it('存在しない場合は null を返す', async () => {
      ddbMock.on(GetCommand).resolves({});

      const result = await repository.getByUserId('user-nonexistent');

      expect(result).toBeNull();
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

      const result = await repository.upsert(sampleInput);

      expect(result.userId).toBe('user-123');
      expect(result.encryptedUserSession).toBe(sampleEncryptedBlob);
      expect(result.acquiredAt).toBe(1700000000000);
      expect(result.estimatedExpiresAt).toBe(1702592000000);
    });

    it('正しいテーブルと Item で PutCommand を呼び出す', async () => {
      ddbMock.on(PutCommand).resolves({});

      await repository.upsert(sampleInput);

      const calls = ddbMock.commandCalls(PutCommand);
      expect(calls).toHaveLength(1);

      const putInput = calls[0].args[0].input;
      expect(putInput.TableName).toBe(tableName);
      expect(putInput.Item?.PK).toBe('USER#user-123');
      expect(putInput.Item?.SK).toBe(NICONICO_CREDENTIAL_SK);
      expect(putInput.Item?.encryptedUserSession).toBe(sampleEncryptedBlob);
    });

    it('条件式なしで upsert する（ConditionalExpression が設定されない）', async () => {
      ddbMock.on(PutCommand).resolves({});

      await repository.upsert(sampleInput);

      const calls = ddbMock.commandCalls(PutCommand);
      expect(calls[0].args[0].input.ConditionExpression).toBeUndefined();
    });

    it('DynamoDB エラーの場合は DatabaseError をスローする', async () => {
      ddbMock.on(PutCommand).rejects(new Error('DynamoDB error'));

      await expect(repository.upsert(sampleInput)).rejects.toThrow(DatabaseError);
    });
  });

  describe('delete', () => {
    it('資格情報を削除できる', async () => {
      ddbMock.on(DeleteCommand).resolves({});

      await expect(repository.delete('user-123')).resolves.not.toThrow();
    });

    it('正しい PK/SK で DeleteCommand を呼び出す', async () => {
      ddbMock.on(DeleteCommand).resolves({});

      await repository.delete('user-123');

      const calls = ddbMock.commandCalls(DeleteCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input.Key).toEqual({
        PK: 'USER#user-123',
        SK: NICONICO_CREDENTIAL_SK,
      });
    });

    it('DynamoDB エラーの場合は DatabaseError をスローする', async () => {
      ddbMock.on(DeleteCommand).rejects(new Error('DynamoDB error'));

      await expect(repository.delete('user-123')).rejects.toThrow(DatabaseError);
    });
  });
});
