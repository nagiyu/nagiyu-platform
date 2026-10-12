/**
 * DynamoDB 版と InMemory 版が同じ振る舞いをすることを確認する共通シナリオ。
 */

import {
  EntityAlreadyExistsError,
  EntityNotFoundError,
  InvalidEntityDataError,
  OptimisticLockError,
} from '../../../../src/dynamodb/errors.js';
import { REMOVE_ATTRIBUTE } from '../../../../src/dynamodb/helpers.js';
import type {
  DynamoDBAttributes,
  DynamoDBKey,
} from '../../../../src/dynamodb/mapper/entity-mapper.interface.js';
import type { EntityStore } from '../../../../src/dynamodb/store/entity-store.interface.js';
import type { Note, Profile } from './entity-store-fixtures.js';

export const NOW = 5_000_000_000_000;
const CREATED = 1_700_000_000_000;
const UPDATED = 1_700_000_100_000;

export interface Harness<TEntity, TKey> {
  store: EntityStore<TEntity, TKey>;
  seed(keys: DynamoDBKey, item: DynamoDBAttributes): void;
  peek(keys: DynamoDBKey): DynamoDBAttributes | undefined;
}

const noteKeys = { PK: 'NOTE#n1', SK: 'META' };
const note: Note = {
  id: 'n1',
  title: '題名',
  memo: 'メモ',
  createdAt: CREATED,
  updatedAt: UPDATED,
};

export function defineNoteScenarios(create: () => Harness<Note, { id: string }>): void {
  let h: Harness<Note, { id: string }>;
  beforeEach(() => {
    h = create();
  });

  it('get: なければ null', async () => {
    await expect(h.store.get({ id: 'n1' })).resolves.toBeNull();
  });

  it('create して get できる', async () => {
    await expect(h.store.create(note)).resolves.toEqual(note);
    await expect(h.store.get({ id: 'n1' })).resolves.toEqual(note);
  });

  it('create: 既にあれば EntityAlreadyExistsError', async () => {
    await h.store.create(note);
    await expect(h.store.create({ ...note, title: '別' })).rejects.toBeInstanceOf(
      EntityAlreadyExistsError
    );
    expect((await h.store.get({ id: 'n1' }))?.title).toBe('題名');
  });

  it('get: 読めないデータは InvalidEntityDataError', async () => {
    h.seed(noteKeys, { ...noteKeys, Id: 'n1', Title: 123, CreatedAt: 1, UpdatedAt: 2 });
    await expect(h.store.get({ id: 'n1' })).rejects.toBeInstanceOf(InvalidEntityDataError);
  });

  it('get: 旧形式 (旧属性名・ISO 文字列・エポック秒) を読める', async () => {
    h.seed(noteKeys, {
      ...noteKeys,
      Id: 'n1',
      title: '旧題名',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: 1_600_000_000,
    });
    await expect(h.store.get({ id: 'n1' })).resolves.toEqual({
      id: 'n1',
      title: '旧題名',
      memo: undefined,
      createdAt: Date.parse('2020-01-01T00:00:00.000Z'),
      updatedAt: 1_600_000_000_000,
    });
  });

  it('put: upsert できる', async () => {
    await expect(h.store.put(note)).resolves.toEqual(note);
    await h.store.put({ ...note, title: '上書き' });
    expect((await h.store.get({ id: 'n1' }))?.title).toBe('上書き');
  });

  it('put: expectedUpdatedAt が一致すれば書ける', async () => {
    await h.store.create(note);
    await h.store.put(
      { ...note, title: '更新', updatedAt: UPDATED + 1 },
      { expectedUpdatedAt: UPDATED }
    );
    expect((await h.store.get({ id: 'n1' }))?.title).toBe('更新');
  });

  it('put: expectedUpdatedAt が不一致なら OptimisticLockError', async () => {
    await h.store.create(note);
    await expect(h.store.put(note, { expectedUpdatedAt: 1 })).rejects.toBeInstanceOf(
      OptimisticLockError
    );
  });

  it('put: expectedUpdatedAt を渡して既存がなければ OptimisticLockError', async () => {
    await expect(h.store.put(note, { expectedUpdatedAt: UPDATED })).rejects.toBeInstanceOf(
      OptimisticLockError
    );
    await expect(h.store.get({ id: 'n1' })).resolves.toBeNull();
  });

  it('update: 属性を更新し UpdatedAt を now で更新して返す', async () => {
    await h.store.create(note);
    const updated = await h.store.update({ id: 'n1' }, { Title: '新題名' });
    expect(updated).toEqual({ ...note, title: '新題名', updatedAt: NOW });
    expect(h.peek(noteKeys)).toMatchObject({ Title: '新題名', UpdatedAt: NOW, CreatedAt: CREATED });
  });

  it('update: REMOVE_ATTRIBUTE で属性を削除する', async () => {
    await h.store.create(note);
    const updated = await h.store.update({ id: 'n1' }, { Memo: REMOVE_ATTRIBUTE });
    expect(updated.memo).toBeUndefined();
    expect(h.peek(noteKeys)).not.toHaveProperty('Memo');
  });

  it('update: 新名を書くとき旧名を REMOVE して二重に残さない', async () => {
    h.seed(noteKeys, {
      ...noteKeys,
      Id: 'n1',
      title: '旧題名',
      memo: '旧メモ',
      createdAt: 1000,
      updatedAt: 2000,
    });
    const updated = await h.store.update({ id: 'n1' }, { Title: '新題名' });
    expect(updated.title).toBe('新題名');
    const stored = h.peek(noteKeys);
    expect(stored).toMatchObject({ Title: '新題名', UpdatedAt: NOW });
    expect(stored).not.toHaveProperty('title');
    expect(stored).not.toHaveProperty('updatedAt');
    // 触っていない属性の旧名は残る
    expect(stored).toHaveProperty('memo', '旧メモ');
  });

  it('update: 空 (undefined のみ) なら UpdatedAt だけ更新する', async () => {
    await h.store.create(note);
    const updated = await h.store.update({ id: 'n1' }, { Title: undefined });
    expect(updated).toEqual({ ...note, updatedAt: NOW });
  });

  it('update: 呼び出し側の UpdatedAt 指定は無視する', async () => {
    await h.store.create(note);
    const updated = await h.store.update({ id: 'n1' }, { UpdatedAt: 1 });
    expect(updated.updatedAt).toBe(NOW);
  });

  it('update: なければ EntityNotFoundError (ストアに作らない)', async () => {
    await expect(h.store.update({ id: 'n1' }, { Title: 'x' })).rejects.toBeInstanceOf(
      EntityNotFoundError
    );
    expect(h.peek(noteKeys)).toBeUndefined();
  });

  it('update: expectedUpdatedAt が一致すれば更新できる', async () => {
    await h.store.create(note);
    const updated = await h.store.update(
      { id: 'n1' },
      { Title: 'x' },
      { expectedUpdatedAt: UPDATED }
    );
    expect(updated.title).toBe('x');
  });

  it('update: expectedUpdatedAt が不一致または不在なら OptimisticLockError', async () => {
    await expect(
      h.store.update({ id: 'n1' }, { Title: 'x' }, { expectedUpdatedAt: UPDATED })
    ).rejects.toBeInstanceOf(OptimisticLockError);
    await h.store.create(note);
    await expect(
      h.store.update({ id: 'n1' }, { Title: 'x' }, { expectedUpdatedAt: 1 })
    ).rejects.toBeInstanceOf(OptimisticLockError);
  });

  it('delete: 削除できる。なければ EntityNotFoundError', async () => {
    await expect(h.store.delete({ id: 'n1' })).rejects.toBeInstanceOf(EntityNotFoundError);
    await h.store.create(note);
    await h.store.delete({ id: 'n1' });
    await expect(h.store.get({ id: 'n1' })).resolves.toBeNull();
  });

  it('deleteIfExists: なくても成功する', async () => {
    await expect(h.store.deleteIfExists({ id: 'n1' })).resolves.toBeUndefined();
    await h.store.create(note);
    await h.store.deleteIfExists({ id: 'n1' });
    await expect(h.store.get({ id: 'n1' })).resolves.toBeNull();
  });
}

export function defineProfileScenarios(create: () => Harness<Profile, { userId: string }>): void {
  let h: Harness<Profile, { userId: string }>;
  beforeEach(() => {
    h = create();
  });

  const profile: Profile = { userId: 'u1', name: '太郎', updatedAt: CREATED };

  it('単一キーで create / get / update / delete できる', async () => {
    await h.store.create(profile);
    await expect(h.store.create(profile)).rejects.toBeInstanceOf(EntityAlreadyExistsError);
    await expect(h.store.get({ userId: 'u1' })).resolves.toEqual(profile);

    const updated = await h.store.update({ userId: 'u1' }, { Name: '花子' });
    expect(updated).toEqual({ userId: 'u1', name: '花子', updatedAt: NOW });

    await h.store.delete({ userId: 'u1' });
    await expect(h.store.get({ userId: 'u1' })).resolves.toBeNull();
    await expect(h.store.delete({ userId: 'u1' })).rejects.toBeInstanceOf(EntityNotFoundError);
  });
}
