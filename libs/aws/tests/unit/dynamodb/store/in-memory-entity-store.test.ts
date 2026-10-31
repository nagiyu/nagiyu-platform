import { InMemorySingleTableStore } from '../../../../src/dynamodb/in-memory/single-table-store.js';
import { InMemoryEntityStore } from '../../../../src/dynamodb/store/in-memory-entity-store.js';
import type { EntityMapper } from '../../../../src/dynamodb/mapper/entity-mapper.interface.js';
import { DatabaseError, EntityAlreadyExistsError } from '../../../../src/dynamodb/errors.js';
import { ENTITY_STORE_ERROR_MESSAGES } from '../../../../src/dynamodb/store/entity-store-support.js';
import { noteMapper, profileMapper, type Note } from './entity-store-fixtures.js';
import {
  NOW,
  defineMapperGuardScenarios,
  defineNoteScenarios,
  defineProfileScenarios,
  type Harness,
} from './entity-store-scenarios.js';

function createHarness<TEntity, TKey>(mapper: EntityMapper<TEntity, TKey>): Harness<TEntity, TKey> {
  const inner = new InMemorySingleTableStore();
  return {
    store: new InMemoryEntityStore(inner, mapper, { now: () => NOW }),
    seed: (keys, item) => inner.putByKey(keys, item),
    peek: (keys) => inner.getByKey(keys),
  };
}

describe('InMemoryEntityStore', () => {
  describe('共通シナリオ (PK/SK)', () => {
    defineNoteScenarios(() => createHarness(noteMapper));
  });

  describe('共通シナリオ (単一キー)', () => {
    defineProfileScenarios(() => createHarness(profileMapper));
  });

  describe('mapper の不具合の扱い', () => {
    defineMapperGuardScenarios((mapper) => createHarness(mapper));
  });

  it('InMemorySingleTableStore の get(pk, sk) からも同じ Item が見える', async () => {
    const inner = new InMemorySingleTableStore();
    const store = new InMemoryEntityStore(inner, noteMapper);
    const note = {
      id: 'n1',
      title: '題名',
      createdAt: 1_700_000_000_000,
    };
    await store.create(note);
    expect(inner.get('NOTE#n1', 'META')).toMatchObject({ Title: '題名' });
    expect(inner.scan().items).toHaveLength(1);
  });

  it('createIfAbsent: 衝突したのに読み直しで見つからなければ cause 付きの DatabaseError', async () => {
    const inner = new InMemorySingleTableStore();
    const store = new InMemoryEntityStore(inner, noteMapper);
    const note = { id: 'n1', title: '題名', createdAt: 1_700_000_000_000 };
    await store.create(note);
    // 衝突の判定では既存が見え、直後の読み直しでは削除済みになる状況を再現する
    const original = inner.getByKey.bind(inner);
    jest.spyOn(inner, 'getByKey').mockImplementationOnce(original).mockReturnValueOnce(undefined);

    const error = await store.createIfAbsent(note).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DatabaseError);
    expect((error as DatabaseError).message).toContain(
      `${ENTITY_STORE_ERROR_MESSAGES.CREATE_CONFLICT_ITEM_MISSING}: Note NOTE#n1#META`
    );
    expect((error as DatabaseError).cause).toBeInstanceOf(EntityAlreadyExistsError);
  });

  it('updateIfAttributeAbsent: 属性の有無は変換前の保存 Item で判定する', async () => {
    const inner = new InMemorySingleTableStore();
    // mapper が読まない属性でも、保存されていれば設定済みとして書かない
    const store = new InMemoryEntityStore(inner, noteMapper, { now: () => NOW });
    inner.putByKey(
      { PK: 'NOTE#n1', SK: 'META' },
      { PK: 'NOTE#n1', SK: 'META', Id: 'n1', Title: '題名', CreatedAt: 1, UpdatedAt: 2, Extra: 'x' }
    );
    const result = await store.updateIfAttributeAbsent({ id: 'n1' }, 'Extra', { title: '別' });
    expect(result.updated).toBe(false);
    expect(inner.getByKey({ PK: 'NOTE#n1', SK: 'META' })).toMatchObject({ Title: '題名' });
  });

  it('now を省略すると現在時刻を使う', async () => {
    const store = new InMemoryEntityStore(new InMemorySingleTableStore(), noteMapper);
    await store.create({
      id: 'n1',
      title: 't',
      createdAt: 1_700_000_000_000,
    });
    const before = Date.now();
    const updated = await store.update({ id: 'n1' }, {});
    expect(updated.updatedAt).toBeGreaterThanOrEqual(before);
  });
});
