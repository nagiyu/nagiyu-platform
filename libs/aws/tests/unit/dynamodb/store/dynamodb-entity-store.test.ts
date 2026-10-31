import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { UpdateCommand, PutCommand, DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBEntityStore } from '../../../../src/dynamodb/store/dynamodb-entity-store.js';
import { ENTITY_STORE_ERROR_MESSAGES } from '../../../../src/dynamodb/store/entity-store-support.js';
import {
  DatabaseError,
  EntityAlreadyExistsError,
  EntityNotFoundError,
  InvalidEntityDataError,
  OptimisticLockError,
} from '../../../../src/dynamodb/errors.js';
import type { EntityMapper } from '../../../../src/dynamodb/mapper/entity-mapper.interface.js';
import {
  createFakeDocClient,
  keyString,
  noteMapper,
  profileMapper,
  type Note,
} from './entity-store-fixtures.js';
import {
  NOW,
  defineMapperGuardScenarios,
  defineNoteScenarios,
  defineProfileScenarios,
  type Harness,
} from './entity-store-scenarios.js';

function createHarness<TEntity, TKey>(
  mapper: EntityMapper<TEntity, TKey>
): Harness<TEntity, TKey> & { send: jest.Mock } {
  const { docClient, table, send } = createFakeDocClient();
  return {
    store: new DynamoDBEntityStore(docClient, 'test-table', mapper, { now: () => NOW }),
    seed: (keys, item) => void table.set(keyString(keys), item),
    peek: (keys) => table.get(keyString(keys)),
    send,
  };
}

describe('DynamoDBEntityStore', () => {
  describe('共通シナリオ (PK/SK)', () => {
    defineNoteScenarios(() => createHarness(noteMapper));
  });

  describe('共通シナリオ (単一キー)', () => {
    defineProfileScenarios(() => createHarness(profileMapper));
  });

  describe('mapper の不具合の扱い', () => {
    defineMapperGuardScenarios((mapper) => createHarness(mapper));
  });

  describe('送信するコマンド', () => {
    const note = {
      id: 'n1',
      title: '題名',
      createdAt: 1_700_000_000_000,
    };
    let h: ReturnType<typeof createHarness<Note, { id: string }>>;
    beforeEach(() => {
      h = createHarness(noteMapper);
    });

    it('get は buildKeys の結果を Key にそのまま渡す', async () => {
      await h.store.get({ id: 'n1' });
      const command = h.send.mock.calls[0][0] as GetCommand;
      expect(command.input).toEqual({
        TableName: 'test-table',
        Key: { PK: 'NOTE#n1', SK: 'META' },
      });
    });

    it('get は consistentRead を ConsistentRead に渡す', async () => {
      await h.store.get({ id: 'n1' }, { consistentRead: true });
      expect((h.send.mock.calls[0][0] as GetCommand).input.ConsistentRead).toBe(true);
    });

    it('create は先頭のキー属性で attribute_not_exists を条件にする', async () => {
      await h.store.create(note);
      const command = h.send.mock.calls[0][0] as PutCommand;
      expect(command.input.ConditionExpression).toBe('attribute_not_exists(#pk)');
      expect(command.input.ExpressionAttributeNames).toEqual({ '#pk': 'PK' });
      expect(command.input.Item).toMatchObject({ CreatedAt: 1_700_000_000_000, UpdatedAt: NOW });
    });

    it('createIfAbsent は新規なら PutCommand 1 回だけで、読み直さない', async () => {
      await h.store.createIfAbsent(note);
      expect(h.send).toHaveBeenCalledTimes(1);
      const command = h.send.mock.calls[0][0] as PutCommand;
      expect(command.input.ConditionExpression).toBe('attribute_not_exists(#pk)');
    });

    it('createIfAbsent は衝突したら強い整合性の GetCommand で既存を読み直す', async () => {
      await h.store.create(note);
      await h.store.createIfAbsent({ ...note, title: '別' });
      expect(h.send).toHaveBeenCalledTimes(3);
      const command = h.send.mock.calls[2][0] as GetCommand;
      expect(command).toBeInstanceOf(GetCommand);
      expect(command.input).toEqual({
        TableName: 'test-table',
        Key: { PK: 'NOTE#n1', SK: 'META' },
        ConsistentRead: true,
      });
    });

    it('create は conflictAsOptimisticLock でも同じ条件式を送る', async () => {
      await h.store.create(note, { conflictAsOptimisticLock: true });
      const input = (h.send.mock.calls[0][0] as PutCommand).input;
      expect(input.ConditionExpression).toBe('attribute_not_exists(#pk)');
      expect(input.ExpressionAttributeNames).toEqual({ '#pk': 'PK' });
    });

    it('updateIfAttributeAbsent は存在と、新名・旧名すべての属性の不在を条件にし、失敗時に旧 Item を要求する', async () => {
      await h.store.create(note);
      await h.store.updateIfAttributeAbsent({ id: 'n1' }, 'Memo', { memo: '追記' });
      const input = (h.send.mock.calls[1][0] as UpdateCommand).input;
      expect(input.ConditionExpression).toBe(
        'attribute_exists(#pk) AND attribute_not_exists(#absent0) AND attribute_not_exists(#absent1)'
      );
      expect(input.ExpressionAttributeNames).toMatchObject({
        '#pk': 'PK',
        '#absent0': 'Memo',
        '#absent1': 'memo',
      });
      expect(input.ReturnValues).toBe('ALL_NEW');
      expect(input.ReturnValuesOnConditionCheckFailure).toBe('ALL_OLD');
    });

    it('updateIfAttributeAbsent は旧名を持たない属性なら新名だけを条件にする', async () => {
      await h.store.create(note);
      await h.store.updateIfAttributeAbsent({ id: 'n1' }, 'Extra', { memo: '追記' });
      const input = (h.send.mock.calls[1][0] as UpdateCommand).input;
      expect(input.ConditionExpression).toBe(
        'attribute_exists(#pk) AND attribute_not_exists(#absent0)'
      );
    });

    it('updateIfAttributeAbsent は設定済みのとき強い整合性の GetCommand で既存を読み直す', async () => {
      await h.store.create({ ...note, memo: '既存' });
      await h.store.updateIfAttributeAbsent({ id: 'n1' }, 'Memo', { memo: '追記' });
      expect(h.send).toHaveBeenCalledTimes(3);
      const command = h.send.mock.calls[2][0] as GetCommand;
      expect(command).toBeInstanceOf(GetCommand);
      expect(command.input.ConsistentRead).toBe(true);
    });

    it('put は条件なし。expectedUpdatedAt があれば存在と UpdatedAt 一致を条件にする', async () => {
      await h.store.put(note);
      expect((h.send.mock.calls[0][0] as PutCommand).input.ConditionExpression).toBeUndefined();

      await h.store.put(note, { expectedUpdatedAt: NOW });
      const input = (h.send.mock.calls[1][0] as PutCommand).input;
      expect(input.ConditionExpression).toBe(
        'attribute_exists(#pk) AND #updatedAt = :expectedUpdatedAt'
      );
      expect(input.ExpressionAttributeNames).toEqual({ '#pk': 'PK', '#updatedAt': 'UpdatedAt' });
      expect(input.ExpressionAttributeValues).toEqual({ ':expectedUpdatedAt': NOW });
      expect(input.ReturnValuesOnConditionCheckFailure).toBe('ALL_OLD');
    });

    it('update は SET / REMOVE と旧名 REMOVE、UpdatedAt の SET を 1 式で送る', async () => {
      await h.store.create(note);
      await h.store.update({ id: 'n1' }, { title: '新', memo: null });
      const input = (h.send.mock.calls[1][0] as UpdateCommand).input;
      expect(input.ReturnValues).toBe('ALL_NEW');
      expect(input.ConditionExpression).toBe('attribute_exists(#pk)');
      // ロックなしの update は旧 Item を要求しない
      expect(input.ReturnValuesOnConditionCheckFailure).toBeUndefined();

      const names = input.ExpressionAttributeNames as Record<string, string>;
      const values = input.ExpressionAttributeValues as Record<string, unknown>;
      const resolve = (expression: string): string =>
        expression
          .replace(/#n\d+/g, (n) => names[n])
          .replace(/:v\d+/g, (v) => JSON.stringify(values[v]));
      const resolved = resolve(input.UpdateExpression as string);
      expect(resolved).toBe(
        `SET Title = "新", UpdatedAt = ${NOW} REMOVE Memo, title, memo, updatedAt`
      );
    });

    it('update に expectedUpdatedAt があれば条件に UpdatedAt の一致を加える', async () => {
      await h.store.create(note);
      await h.store.update({ id: 'n1' }, { title: '新' }, { expectedUpdatedAt: NOW });
      const input = (h.send.mock.calls[1][0] as UpdateCommand).input;
      expect(input.ConditionExpression).toBe(
        'attribute_exists(#pk) AND #updatedAt = :expectedUpdatedAt'
      );
      expect(input.ExpressionAttributeValues).toMatchObject({
        ':expectedUpdatedAt': NOW,
      });
    });

    it('delete は存在を条件にし、deleteIfExists は条件を付けない', async () => {
      await h.store.create(note);
      await h.store.delete({ id: 'n1' });
      expect((h.send.mock.calls[1][0] as DeleteCommand).input.ConditionExpression).toBe(
        'attribute_exists(#pk)'
      );
      await h.store.deleteIfExists({ id: 'n1' });
      expect((h.send.mock.calls[2][0] as DeleteCommand).input.ConditionExpression).toBeUndefined();
    });

    it('属性なしの update は UpdatedAt の SET と旧 UpdatedAt の REMOVE だけを送る', async () => {
      await h.store.create(note);
      await h.store.update({ id: 'n1' }, {});
      const input = (h.send.mock.calls[1][0] as UpdateCommand).input;
      expect(input.UpdateExpression).toBe('SET #n1 = :v1 REMOVE #n0');
      expect(input.ExpressionAttributeNames).toMatchObject({
        '#n0': 'updatedAt',
        '#n1': 'UpdatedAt',
      });
      expect(input.ExpressionAttributeValues).toEqual({ ':v1': NOW });
    });
  });

  describe('エラー変換', () => {
    const note = {
      id: 'n1',
      title: '題名',
      createdAt: 1_700_000_000_000,
    };
    const failing = (error: unknown): DynamoDBEntityStore<Note, { id: string }> =>
      new DynamoDBEntityStore(
        { send: jest.fn().mockRejectedValue(error) } as never,
        'test-table',
        noteMapper
      );

    it('SDK 例外は DatabaseError に正規化する (全操作)', async () => {
      const store = failing(new Error('boom'));
      await expect(store.get({ id: 'n1' })).rejects.toBeInstanceOf(DatabaseError);
      await expect(store.create(note)).rejects.toBeInstanceOf(DatabaseError);
      await expect(store.put(note)).rejects.toBeInstanceOf(DatabaseError);
      await expect(store.update({ id: 'n1' }, {})).rejects.toBeInstanceOf(DatabaseError);
      await expect(store.delete({ id: 'n1' })).rejects.toBeInstanceOf(DatabaseError);
      await expect(store.deleteIfExists({ id: 'n1' })).rejects.toBeInstanceOf(DatabaseError);
    });

    it('条件失敗に旧 Item が付いていれば OptimisticLockError、なければ EntityNotFoundError', async () => {
      const withItem = failing(
        new ConditionalCheckFailedException({
          message: 'x',
          $metadata: {},
          Item: { PK: { S: 'NOTE#n1' } },
        })
      );
      await expect(withItem.put(note, { expectedUpdatedAt: 1 })).rejects.toBeInstanceOf(
        OptimisticLockError
      );
      await expect(
        withItem.update({ id: 'n1' }, {}, { expectedUpdatedAt: 1 })
      ).rejects.toBeInstanceOf(OptimisticLockError);

      const withoutItem = failing(
        new ConditionalCheckFailedException({ message: 'x', $metadata: {} })
      );
      await expect(withoutItem.put(note, { expectedUpdatedAt: 1 })).rejects.toBeInstanceOf(
        EntityNotFoundError
      );
      await expect(withoutItem.update({ id: 'n1' }, {})).rejects.toBeInstanceOf(
        EntityNotFoundError
      );
    });

    it('createIfAbsent / updateIfAttributeAbsent も SDK 例外は DatabaseError に正規化する', async () => {
      const store = failing(new Error('boom'));
      await expect(store.createIfAbsent(note)).rejects.toBeInstanceOf(DatabaseError);
      await expect(
        store.updateIfAttributeAbsent({ id: 'n1' }, 'Memo', { memo: 'x' })
      ).rejects.toBeInstanceOf(DatabaseError);
    });

    it('create の衝突は、conflictAsOptimisticLock の有無でエラー型が変わる', async () => {
      const store = failing(new ConditionalCheckFailedException({ message: 'x', $metadata: {} }));
      await expect(store.create(note)).rejects.toBeInstanceOf(EntityAlreadyExistsError);
      await expect(store.create(note, { conflictAsOptimisticLock: true })).rejects.toBeInstanceOf(
        OptimisticLockError
      );
    });

    it('createIfAbsent: 衝突したのに読み直しで見つからなければ cause 付きの DatabaseError', async () => {
      const send = jest
        .fn()
        .mockRejectedValueOnce(new ConditionalCheckFailedException({ message: 'x', $metadata: {} }))
        .mockResolvedValueOnce({});
      const store = new DynamoDBEntityStore({ send } as never, 'test-table', noteMapper);
      const error = await store.createIfAbsent(note).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DatabaseError);
      expect((error as DatabaseError).message).toContain(
        `${ENTITY_STORE_ERROR_MESSAGES.CREATE_CONFLICT_ITEM_MISSING}: Note NOTE#n1#META`
      );
      expect((error as DatabaseError).cause).toBeInstanceOf(EntityAlreadyExistsError);
    });

    it('updateIfAttributeAbsent: 条件失敗に旧 Item がなければ EntityNotFoundError', async () => {
      const store = failing(new ConditionalCheckFailedException({ message: 'x', $metadata: {} }));
      await expect(
        store.updateIfAttributeAbsent({ id: 'n1' }, 'Memo', { memo: 'x' })
      ).rejects.toBeInstanceOf(EntityNotFoundError);
    });

    it('updateIfAttributeAbsent: 設定済みの失敗後、読み直しで見つからなければ EntityNotFoundError', async () => {
      const send = jest
        .fn()
        .mockRejectedValueOnce(
          new ConditionalCheckFailedException({
            message: 'x',
            $metadata: {},
            Item: { PK: { S: 'NOTE#n1' } },
          })
        )
        .mockResolvedValueOnce({});
      const store = new DynamoDBEntityStore({ send } as never, 'test-table', noteMapper);
      await expect(
        store.updateIfAttributeAbsent({ id: 'n1' }, 'Memo', { memo: 'x' })
      ).rejects.toBeInstanceOf(EntityNotFoundError);
    });

    it('updateIfAttributeAbsent: 結果に Attributes がなければ InvalidEntityDataError', async () => {
      const store = new DynamoDBEntityStore(
        { send: jest.fn().mockResolvedValue({}) } as never,
        'test-table',
        noteMapper
      );
      await expect(
        store.updateIfAttributeAbsent({ id: 'n1' }, 'Memo', { memo: 'x' })
      ).rejects.toBeInstanceOf(InvalidEntityDataError);
    });

    it('RepositoryError はそのまま通す', async () => {
      const error = new InvalidEntityDataError('壊れている');
      await expect(failing(error).get({ id: 'n1' })).rejects.toBe(error);
    });

    it('update の結果に Attributes がなければ InvalidEntityDataError', async () => {
      const store = new DynamoDBEntityStore(
        { send: jest.fn().mockResolvedValue({}) } as never,
        'test-table',
        noteMapper
      );
      await expect(store.update({ id: 'n1' }, {})).rejects.toBeInstanceOf(InvalidEntityDataError);
    });

    it('mapper が RepositoryError 以外を投げても InvalidEntityDataError にする', async () => {
      const brokenMapper: EntityMapper<Note, { id: string }> = {
        ...noteMapper,
        toEntity: () => {
          throw new TypeError('想定外');
        },
      };
      const store = new DynamoDBEntityStore(
        { send: jest.fn().mockResolvedValue({ Item: { PK: 'a' } }) } as never,
        'test-table',
        brokenMapper
      );
      await expect(store.get({ id: 'n1' })).rejects.toBeInstanceOf(InvalidEntityDataError);
    });
  });

  it('now を省略すると現在時刻を使う', async () => {
    const { docClient, send } = createFakeDocClient();
    const store = new DynamoDBEntityStore(docClient, 'test-table', noteMapper);
    await store.create({
      id: 'n1',
      title: 't',
      createdAt: 1_700_000_000_000,
    });
    const before = Date.now();
    const updated = await store.update({ id: 'n1' }, {});
    expect(updated.updatedAt).toBeGreaterThanOrEqual(before);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
