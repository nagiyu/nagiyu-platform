import { InMemorySingleTableStore } from '../../../../src/dynamodb/in-memory/single-table-store.js';
import { InMemoryEntityStore } from '../../../../src/dynamodb/store/in-memory-entity-store.js';
import type { EntityMapper } from '../../../../src/dynamodb/mapper/entity-mapper.interface.js';
import { noteMapper, profileMapper, type Note } from './entity-store-fixtures.js';
import {
  NOW,
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

  it('InMemorySingleTableStore の get(pk, sk) からも同じ Item が見える', async () => {
    const inner = new InMemorySingleTableStore();
    const store = new InMemoryEntityStore(inner, noteMapper);
    const note: Note = {
      id: 'n1',
      title: '題名',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_100_000,
    };
    await store.create(note);
    expect(inner.get('NOTE#n1', 'META')).toMatchObject({ Title: '題名' });
    expect(inner.scan().items).toHaveLength(1);
  });

  it('now を省略すると現在時刻を使う', async () => {
    const store = new InMemoryEntityStore(new InMemorySingleTableStore(), noteMapper);
    await store.create({
      id: 'n1',
      title: 't',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_100_000,
    });
    const before = Date.now();
    const updated = await store.update({ id: 'n1' }, {});
    expect(updated.updatedAt).toBeGreaterThanOrEqual(before);
  });
});
