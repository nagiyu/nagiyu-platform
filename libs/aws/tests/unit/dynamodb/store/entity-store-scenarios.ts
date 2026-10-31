/**
 * DynamoDB 版と InMemory 版が同じ振る舞いをすることを確認する共通シナリオ。
 */

import {
  DatabaseError,
  EntityAlreadyExistsError,
  EntityNotFoundError,
  InvalidEntityDataError,
  OptimisticLockError,
} from '../../../../src/dynamodb/errors.js';
import type {
  DynamoDBAttributes,
  DynamoDBKey,
} from '../../../../src/dynamodb/mapper/entity-mapper.interface.js';
import type {
  EntityCreateInput,
  EntityPutInput,
  EntityStore,
} from '../../../../src/dynamodb/store/entity-store.interface.js';
import type { EntityMapper } from '../../../../src/dynamodb/mapper/entity-mapper.interface.js';
import { noteMapper } from './entity-store-fixtures.js';
import type { Note, Profile } from './entity-store-fixtures.js';

export const NOW = 5_000_000_000_000;
const CREATED = 1_700_000_000_000;

export interface Harness<TEntity, TKey> {
  store: EntityStore<TEntity, TKey>;
  seed(keys: DynamoDBKey, item: DynamoDBAttributes): void;
  peek(keys: DynamoDBKey): DynamoDBAttributes | undefined;
}

const noteKeys = { PK: 'NOTE#n1', SK: 'META' };
/** 呼び出し側が渡す入力。updatedAt は持たない */
const note = {
  id: 'n1',
  title: '題名',
  memo: 'メモ',
  createdAt: CREATED,
};

/** store が書いた後の姿 (UpdatedAt は now) */
const stored: Note = { ...note, updatedAt: NOW };

/** createdAt を省略したときの、store が書いた後の姿 (createdAt も now) */
const storedWithoutCreatedAt: Note = { ...stored, createdAt: NOW };
const { createdAt: _createdAt, ...noteWithoutCreatedAt } = note;

export function defineNoteScenarios(create: () => Harness<Note, { id: string }>): void {
  let h: Harness<Note, { id: string }>;
  beforeEach(() => {
    h = create();
  });

  it('get: なければ null', async () => {
    await expect(h.store.get({ id: 'n1' })).resolves.toBeNull();
  });

  it('create して get できる', async () => {
    await expect(h.store.create(note)).resolves.toEqual(stored);
    await expect(h.store.get({ id: 'n1' })).resolves.toEqual(stored);
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
    await expect(h.store.put(note)).resolves.toEqual(stored);
    await h.store.put({ ...note, title: '上書き' });
    expect((await h.store.get({ id: 'n1' }))?.title).toBe('上書き');
  });

  it('create / put: UpdatedAt は store が now で設定し、指定した createdAt はそのまま書く', async () => {
    await h.store.create(note);
    expect(h.peek(noteKeys)).toMatchObject({ CreatedAt: CREATED, UpdatedAt: NOW });
    await h.store.put(note);
    expect(h.peek(noteKeys)).toMatchObject({ CreatedAt: CREATED, UpdatedAt: NOW });
  });

  it('create: createdAt を省略すると CreatedAt と UpdatedAt を同じ now で書く', async () => {
    await expect(h.store.create(noteWithoutCreatedAt)).resolves.toEqual(storedWithoutCreatedAt);
    expect(h.peek(noteKeys)).toMatchObject({ CreatedAt: NOW, UpdatedAt: NOW });
  });

  it('put: createdAt が undefined なら CreatedAt と UpdatedAt を同じ now で書く', async () => {
    await expect(h.store.put({ ...note, createdAt: undefined })).resolves.toEqual(
      storedWithoutCreatedAt
    );
    expect(h.peek(noteKeys)).toMatchObject({ CreatedAt: NOW, UpdatedAt: NOW });
  });

  it('put: 既存の createdAt を引き継げる', async () => {
    await h.store.create(note);
    const existing = await h.store.get({ id: 'n1' });
    await h.store.put({ ...note, title: '上書き', createdAt: existing?.createdAt });
    expect(h.peek(noteKeys)).toMatchObject({ CreatedAt: CREATED, Title: '上書き' });
  });

  it('create / put: 呼び出し側が updatedAt を渡しても無視して now で上書きする', async () => {
    // 型では渡せないため、型を崩して JS 呼び出しや spread 経由の混入を再現する
    const withUpdatedAt = { ...note, updatedAt: 1 } as unknown as EntityCreateInput<Note>;
    await expect(h.store.create(withUpdatedAt)).resolves.toEqual(stored);
    expect(h.peek(noteKeys)).toMatchObject({ UpdatedAt: NOW });
    await h.store.put({ ...withUpdatedAt, createdAt: CREATED } as EntityPutInput<Note>);
    expect(h.peek(noteKeys)).toMatchObject({ UpdatedAt: NOW });
  });

  it('入力型: updatedAt の指定と put の createdAt 欠落は型エラーになる', async () => {
    // 実行時の結果ではなく、型チェックで弾かれることを確かめる
    const typeChecks = async (): Promise<void> => {
      // @ts-expect-error create の入力に updatedAt は渡せない
      await h.store.create({ ...note, updatedAt: 1 });
      // @ts-expect-error put の入力に updatedAt は渡せない
      await h.store.put({ ...note, updatedAt: 1 });
      // @ts-expect-error put は createdAt のキーを省略できない
      await h.store.put(noteWithoutCreatedAt);
    };
    expect(typeChecks).toBeInstanceOf(Function);
  });

  it('put: expectedUpdatedAt が一致すれば書ける', async () => {
    await h.store.create(note);
    await h.store.put({ ...note, title: '更新' }, { expectedUpdatedAt: NOW });
    expect((await h.store.get({ id: 'n1' }))?.title).toBe('更新');
  });

  it('put: expectedUpdatedAt が不一致なら OptimisticLockError', async () => {
    await h.store.create(note);
    await expect(h.store.put(note, { expectedUpdatedAt: 1 })).rejects.toBeInstanceOf(
      OptimisticLockError
    );
  });

  it('put: expectedUpdatedAt を渡して既存がなければ EntityNotFoundError', async () => {
    await expect(h.store.put(note, { expectedUpdatedAt: NOW })).rejects.toBeInstanceOf(
      EntityNotFoundError
    );
    await expect(h.store.get({ id: 'n1' })).resolves.toBeNull();
  });

  it('update: 属性を更新し UpdatedAt を now で更新して返す', async () => {
    await h.store.create(note);
    const updated = await h.store.update({ id: 'n1' }, { title: '新題名' });
    expect(updated).toEqual({ ...stored, title: '新題名' });
    expect(h.peek(noteKeys)).toMatchObject({ Title: '新題名', UpdatedAt: NOW, CreatedAt: CREATED });
  });

  it('update: REMOVE_ATTRIBUTE で属性を削除する', async () => {
    await h.store.create(note);
    const updated = await h.store.update({ id: 'n1' }, { memo: null });
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
    const updated = await h.store.update({ id: 'n1' }, { title: '新題名' });
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
    const updated = await h.store.update({ id: 'n1' }, { title: undefined });
    expect(updated).toEqual(stored);
  });

  it('update: 呼び出し側の UpdatedAt 指定は無視する', async () => {
    await h.store.create(note);
    const updated = await h.store.update({ id: 'n1' }, { updatedAt: 1 });
    expect(updated.updatedAt).toBe(NOW);
  });

  it('update: なければ EntityNotFoundError (ストアに作らない)', async () => {
    await expect(h.store.update({ id: 'n1' }, { title: 'x' })).rejects.toBeInstanceOf(
      EntityNotFoundError
    );
    expect(h.peek(noteKeys)).toBeUndefined();
  });

  it('update: expectedUpdatedAt が一致すれば更新できる', async () => {
    await h.store.create(note);
    const updated = await h.store.update({ id: 'n1' }, { title: 'x' }, { expectedUpdatedAt: NOW });
    expect(updated.title).toBe('x');
  });

  it('update: expectedUpdatedAt を渡して不在なら EntityNotFoundError、不一致なら OptimisticLockError', async () => {
    await expect(
      h.store.update({ id: 'n1' }, { title: 'x' }, { expectedUpdatedAt: NOW })
    ).rejects.toBeInstanceOf(EntityNotFoundError);
    await h.store.create(note);
    await expect(
      h.store.update({ id: 'n1' }, { title: 'x' }, { expectedUpdatedAt: 1 })
    ).rejects.toBeInstanceOf(OptimisticLockError);
  });

  it('delete: 削除できる。なければ EntityNotFoundError', async () => {
    await expect(h.store.delete({ id: 'n1' })).rejects.toBeInstanceOf(EntityNotFoundError);
    await h.store.create(note);
    await h.store.delete({ id: 'n1' });
    await expect(h.store.get({ id: 'n1' })).resolves.toBeNull();
  });

  it('get: consistentRead を指定しても取得できる', async () => {
    await h.store.create(note);
    await expect(h.store.get({ id: 'n1' }, { consistentRead: true })).resolves.toEqual(stored);
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

  // createdAt を持たない Entity。入力は createdAt も updatedAt も要らない
  const profile = { userId: 'u1', name: '太郎' };

  it('単一キーで create / get / update / delete できる', async () => {
    await h.store.create(profile);
    await expect(h.store.create(profile)).rejects.toBeInstanceOf(EntityAlreadyExistsError);
    await expect(h.store.get({ userId: 'u1' })).resolves.toEqual({ ...profile, updatedAt: NOW });
    await expect(h.store.put({ ...profile, name: '次郎' })).resolves.toEqual({
      ...profile,
      name: '次郎',
      updatedAt: NOW,
    });
    await h.store.put(profile);

    const updated = await h.store.update({ userId: 'u1' }, { name: '花子' });
    expect(updated).toEqual({ userId: 'u1', name: '花子', updatedAt: NOW });

    await h.store.delete({ userId: 'u1' });
    await expect(h.store.get({ userId: 'u1' })).resolves.toBeNull();
    await expect(h.store.delete({ userId: 'u1' })).rejects.toBeInstanceOf(EntityNotFoundError);
  });
}

/** mapper の不具合 (キー属性の更新、キーの食い違う Item、素の例外) の扱いが両実装で揃うことを確認する */
export function defineMapperGuardScenarios(
  create: (mapper: EntityMapper<Note, { id: string }>) => Harness<Note, { id: string }>
): void {
  it('update: toUpdateAttributes がキー属性を返したら InvalidEntityDataError', async () => {
    const h = create({ ...noteMapper, toUpdateAttributes: () => ({ SK: 'OTHER' }) });
    await h.store.create(note);
    await expect(h.store.update({ id: 'n1' }, { title: 'x' })).rejects.toBeInstanceOf(
      InvalidEntityDataError
    );
    expect(h.peek(noteKeys)).toMatchObject({ SK: 'META' });
  });

  it('update: toUpdateAttributes にビジネスキーが渡り、キーから作る属性を付け直せる', async () => {
    const received: unknown[] = [];
    const h = create({
      ...noteMapper,
      toUpdateAttributes: (changes, key) => {
        received.push(key);
        return { ...noteMapper.toUpdateAttributes(changes, key), GSI1SK: `NOTE#${key.id}` };
      },
    });
    await h.store.create(note);
    await h.store.update({ id: 'n1' }, { title: '新題名' });
    expect(received).toEqual([{ id: 'n1' }]);
    expect(h.peek(noteKeys)).toMatchObject({ Title: '新題名', GSI1SK: 'NOTE#n1' });
  });

  it('create / put: toItem のキーが buildKeys と食い違えば DatabaseError', async () => {
    const h = create({ ...noteMapper, toItem: (e) => ({ ...noteMapper.toItem(e), SK: 'OTHER' }) });
    await expect(h.store.create(note)).rejects.toBeInstanceOf(DatabaseError);
    await expect(h.store.put(note)).rejects.toBeInstanceOf(DatabaseError);
  });

  it('create: toItem がキー属性を欠けば DatabaseError', async () => {
    const h = create({
      ...noteMapper,
      toItem: (e) => {
        const { PK: _pk, ...rest } = noteMapper.toItem(e);
        return rest;
      },
    });
    await expect(h.store.create(note)).rejects.toBeInstanceOf(DatabaseError);
  });

  it('mapper の素の例外は InvalidEntityDataError に揃える', async () => {
    const boom = (): never => {
      throw new TypeError('想定外');
    };
    const h = create({ ...noteMapper, toItem: boom });
    await expect(h.store.create(note)).rejects.toBeInstanceOf(InvalidEntityDataError);
    const h2 = create({ ...noteMapper, buildKeys: boom });
    await expect(h2.store.get({ id: 'n1' })).rejects.toBeInstanceOf(InvalidEntityDataError);
    const h3 = create({ ...noteMapper, toUpdateAttributes: boom });
    await expect(h3.store.update({ id: 'n1' }, {})).rejects.toBeInstanceOf(InvalidEntityDataError);
  });

  it('legacyAttributeNames の旧名が UpdatedAt やキー属性名でも、それらは REMOVE しない', async () => {
    const h = create({
      ...noteMapper,
      legacyAttributeNames: { Title: ['PK', 'UpdatedAt', 'title'], UpdatedAt: ['SK'] },
    });
    await h.store.create(note);
    await h.store.update({ id: 'n1' }, { title: 'x' });
    expect(h.peek(noteKeys)).toMatchObject({ PK: 'NOTE#n1', SK: 'META', UpdatedAt: NOW });
  });
}
