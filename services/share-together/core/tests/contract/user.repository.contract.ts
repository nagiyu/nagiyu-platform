/**
 * UserRepository 契約テスト（実装非依存の振る舞い仕様）
 *
 * InMemory実装と実DynamoDB実装（DynamoDB Local）の双方に同一の仕様を通し、
 * 実装間の乖離を機械的に検知する。各テストは決定的で単一の結末を持つ。
 *
 * batchGetByIds は順序を契約にしない（実 DynamoDB の BatchGetItem は順序を保証しない）ため、
 * ID の集合で比べる。getByEmail は GSI2 の完全一致引きで、メールアドレスの重複は仕様外。
 *
 * 旧形式（camelCase の属性名・ISO 文字列の時刻・Type なし）のアイテムは、移行前のデータが
 * 書き込まれるまで残るために読めて、更新で新名に置き換わる必要がある。
 */

import type { UserRepository } from '../../src/repositories/user/user-repository.interface.js';
import type { CreateUserInput } from '../../src/types/index.js';
import type { RawStoreHooks } from './helpers/raw-store.js';
import {
  LEGACY_CREATED_AT,
  LEGACY_UPDATED_AT,
  toLegacyTimestamp,
  waitForTimestampAdvance,
} from './helpers/time.js';

/** 契約テストの対象実装が満たすべきフック */
export interface UserRepositoryContractHooks extends RawStoreHooks {
  /** テスト対象のリポジトリを生成する（reset の後に呼ばれる） */
  makeRepository: () => Promise<UserRepository>;
}

function buildUserInput(overrides: Partial<CreateUserInput> = {}): CreateUserInput {
  return {
    userId: 'user-1',
    email: 'user-1@example.com',
    name: '太郎',
    image: 'https://example.com/user-1.png',
    defaultListId: 'list-1',
    ...overrides,
  };
}

/** 旧形式のユーザーアイテム */
function buildLegacyUserItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'USER#legacy-1',
    SK: '#META#',
    GSI2PK: 'EMAIL#legacy-1@example.com',
    userId: 'legacy-1',
    email: 'legacy-1@example.com',
    name: '旧形式',
    image: 'https://example.com/legacy-1.png',
    defaultListId: 'legacy-list-1',
    createdAt: toLegacyTimestamp(LEGACY_CREATED_AT),
    updatedAt: toLegacyTimestamp(LEGACY_UPDATED_AT),
    ...overrides,
  };
}

function sortedUserIds(users: Array<{ userId: string }>): string[] {
  return users.map((user) => user.userId).sort();
}

/**
 * UserRepository の契約テストスイートを定義する。
 *
 * @param label - テスト対象実装のラベル（describe名に使用）
 * @param hooks - テスト対象実装を操作するためのフック
 */
export function defineUserRepositoryContract(
  label: string,
  hooks: UserRepositoryContractHooks
): void {
  describe(`UserRepository 契約: ${label}`, () => {
    let repository: UserRepository;

    beforeEach(async () => {
      await hooks.reset();
      repository = await hooks.makeRepository();
    });

    afterAll(async () => {
      if (hooks.teardown) {
        await hooks.teardown();
      }
    });

    describe('CRUD', () => {
      it('create したユーザーを getById で取得できる', async () => {
        const input = buildUserInput();

        const created = await repository.create(input);

        expect(created).toMatchObject(input);
        expect(typeof created.createdAt).toBe('number');
        // store が 1 回読んだ時刻を createdAt と updatedAt の両方に使う
        expect(created.updatedAt).toBe(created.createdAt);
        expect(await repository.getById(input.userId)).toEqual(created);
      });

      it('画像のないユーザーを作成すると、Image 属性ごと省かれる', async () => {
        const created = await repository.create(buildUserInput({ image: undefined }));

        // Entity 側は image が undefined であることだけを契約にする（キーの有無は問わない）
        expect(created.image).toBeUndefined();
        expect(await hooks.getRawItem('USER#user-1', '#META#')).not.toHaveProperty('Image');
        expect((await repository.getById('user-1'))?.image).toBeUndefined();
      });

      it('保存形式は PascalCase の属性名と数値ミリ秒の時刻で、Type を持つ', async () => {
        const created = await repository.create(buildUserInput());

        const raw = await hooks.getRawItem('USER#user-1', '#META#');
        expect(raw).toMatchObject({
          Type: 'User',
          GSI2PK: 'EMAIL#user-1@example.com',
          UserID: 'user-1',
          Email: 'user-1@example.com',
          Name: '太郎',
          Image: 'https://example.com/user-1.png',
          DefaultListID: 'list-1',
          CreatedAt: created.createdAt,
          UpdatedAt: created.updatedAt,
        });
        for (const legacyName of [
          'userId',
          'email',
          'name',
          'image',
          'defaultListId',
          'createdAt',
          'updatedAt',
        ]) {
          expect(raw).not.toHaveProperty(legacyName);
        }
      });

      it('getById は存在しないユーザーに対して null を返す', async () => {
        expect(await repository.getById('no-such-user')).toBeNull();
      });

      it('同じユーザー ID の重複作成は EntityAlreadyExistsError をスローし、既存のユーザーを変えない', async () => {
        const first = await repository.create(buildUserInput());

        await expect(repository.create(buildUserInput({ name: '別人' }))).rejects.toThrow(
          expect.objectContaining({ name: 'EntityAlreadyExistsError' })
        );

        expect(await repository.getById('user-1')).toEqual(first);
      });

      it('update は更新後の Entity を返し、updatedAt が進み、他の項目は変わらない', async () => {
        const created = await repository.create(buildUserInput());
        await waitForTimestampAdvance();

        const updated = await repository.update('user-1', { name: '次郎' });

        expect(updated).toEqual({
          ...created,
          name: '次郎',
          updatedAt: updated.updatedAt,
        });
        expect(updated.updatedAt).toBeGreaterThan(created.updatedAt);
        expect(await repository.getById('user-1')).toEqual(updated);
      });

      it('存在しないユーザーの update は EntityNotFoundError をスローし、アイテムを作らない', async () => {
        await expect(repository.update('no-such-user', { name: '次郎' })).rejects.toThrow(
          expect.objectContaining({ name: 'EntityNotFoundError' })
        );

        expect(await repository.getById('no-such-user')).toBeNull();
        expect(await hooks.getRawItem('USER#no-such-user', '#META#')).toBeUndefined();
      });

      it('delete すると getById で取得できなくなる', async () => {
        await repository.create(buildUserInput());

        await repository.delete('user-1');

        expect(await repository.getById('user-1')).toBeNull();
      });

      it('存在しないユーザーの delete は EntityNotFoundError をスローする', async () => {
        await expect(repository.delete('no-such-user')).rejects.toThrow(
          expect.objectContaining({ name: 'EntityNotFoundError' })
        );
      });
    });

    describe('getByEmail', () => {
      it('メールアドレスが一致するユーザーだけを返す', async () => {
        await repository.create(buildUserInput({ userId: 'user-1', email: 'a@example.com' }));
        const target = await repository.create(
          buildUserInput({ userId: 'user-2', email: 'b@example.com' })
        );

        expect(await repository.getByEmail('b@example.com')).toEqual(target);
      });

      it('大文字小文字の表記が違っても同じユーザーを返し、Email は登録時の表記のまま', async () => {
        const target = await repository.create(
          buildUserInput({ userId: 'user-1', email: 'Dave@Example.com' })
        );

        expect(await repository.getByEmail('DAVE@EXAMPLE.COM')).toEqual(target);
        expect(target.email).toBe('Dave@Example.com');
      });

      it('一致するユーザーがいなければ null を返す', async () => {
        await repository.create(buildUserInput({ email: 'a@example.com' }));

        expect(await repository.getByEmail('nobody@example.com')).toBeNull();
      });

      it('メールアドレスを update すると、新しいアドレスで引け、古いアドレスでは引けない', async () => {
        await repository.create(buildUserInput({ email: 'old@example.com' }));

        const updated = await repository.update('user-1', { email: 'new@example.com' });

        expect(await repository.getByEmail('new@example.com')).toEqual(updated);
        expect(await repository.getByEmail('old@example.com')).toBeNull();
      });

      it('削除したユーザーは引けなくなる', async () => {
        await repository.create(buildUserInput({ email: 'a@example.com' }));

        await repository.delete('user-1');

        expect(await repository.getByEmail('a@example.com')).toBeNull();
      });
    });

    describe('batchGetByIds', () => {
      it('指定した ID のユーザーを集合として返す', async () => {
        for (const id of ['user-1', 'user-2', 'user-3']) {
          await repository.create(buildUserInput({ userId: id, email: `${id}@example.com` }));
        }

        const users = await repository.batchGetByIds(['user-3', 'user-1']);

        expect(sortedUserIds(users)).toEqual(['user-1', 'user-3']);
      });

      it('重複した ID は 1 件にまとめて返す', async () => {
        await repository.create(buildUserInput({ userId: 'user-1' }));

        const users = await repository.batchGetByIds(['user-1', 'user-1', 'user-1']);

        expect(sortedUserIds(users)).toEqual(['user-1']);
      });

      it('存在しない ID は結果に含めない', async () => {
        await repository.create(buildUserInput({ userId: 'user-1' }));

        const users = await repository.batchGetByIds(['no-such-user', 'user-1']);

        expect(sortedUserIds(users)).toEqual(['user-1']);
      });

      it('空の配列には空の配列を返す', async () => {
        expect(await repository.batchGetByIds([])).toEqual([]);
      });

      // BatchGetItem の上限は 1 回 100 件。ちょうど使い切る件数とそれを 1 件超える件数で分割を確かめる
      it.each([100, 101])('%i 件の ID でも全件を返す', async (count) => {
        const ids = Array.from(
          { length: count },
          (_, index) => `user-${String(index).padStart(3, '0')}`
        );
        for (const id of ids) {
          await repository.create(buildUserInput({ userId: id, email: `${id}@example.com` }));
        }

        const users = await repository.batchGetByIds([...ids, ...ids.slice(0, 10), 'no-such-user']);

        expect(sortedUserIds(users)).toEqual(ids);
      });
    });

    describe('旧形式のアイテム', () => {
      it('旧形式のユーザーを getById で読める', async () => {
        await hooks.putRawItem(buildLegacyUserItem());

        expect(await repository.getById('legacy-1')).toEqual({
          userId: 'legacy-1',
          email: 'legacy-1@example.com',
          name: '旧形式',
          image: 'https://example.com/legacy-1.png',
          defaultListId: 'legacy-list-1',
          createdAt: LEGACY_CREATED_AT,
          updatedAt: LEGACY_UPDATED_AT,
        });
      });

      it('画像のない旧形式のユーザーは image が undefined の Entity になる', async () => {
        const legacyItem = buildLegacyUserItem();
        delete legacyItem.image;
        await hooks.putRawItem(legacyItem);

        expect((await repository.getById('legacy-1'))?.image).toBeUndefined();
      });

      it('旧形式のユーザーを getByEmail と batchGetByIds で引ける', async () => {
        await hooks.putRawItem(buildLegacyUserItem());
        await repository.create(buildUserInput());

        expect((await repository.getByEmail('legacy-1@example.com'))?.userId).toBe('legacy-1');
        expect(sortedUserIds(await repository.batchGetByIds(['legacy-1', 'user-1']))).toEqual([
          'legacy-1',
          'user-1',
        ]);
      });

      it('旧形式のユーザーを update すると、書いた属性が新名になり旧名が消え、再読み込みしても同じ Entity になる', async () => {
        await hooks.putRawItem(buildLegacyUserItem());
        await waitForTimestampAdvance();

        const updated = await repository.update('legacy-1', { name: '更新後' });

        expect(updated).toMatchObject({
          userId: 'legacy-1',
          email: 'legacy-1@example.com',
          name: '更新後',
          createdAt: LEGACY_CREATED_AT,
        });
        expect(updated.updatedAt).toBeGreaterThan(LEGACY_UPDATED_AT);

        const raw = await hooks.getRawItem('USER#legacy-1', '#META#');
        expect(raw).toMatchObject({ Name: '更新後', UpdatedAt: updated.updatedAt });
        expect(raw).not.toHaveProperty('name');
        expect(raw).not.toHaveProperty('updatedAt');
        expect(await repository.getById('legacy-1')).toEqual(updated);
      });

      it('旧形式のユーザーのメールアドレスを update すると、GSI2PK も付け直される', async () => {
        await hooks.putRawItem(buildLegacyUserItem());

        const updated = await repository.update('legacy-1', { email: 'moved@example.com' });

        const raw = await hooks.getRawItem('USER#legacy-1', '#META#');
        expect(raw).toMatchObject({
          Email: 'moved@example.com',
          GSI2PK: 'EMAIL#moved@example.com',
        });
        expect(raw).not.toHaveProperty('email');
        expect(await repository.getByEmail('moved@example.com')).toEqual(updated);
        expect(await repository.getByEmail('legacy-1@example.com')).toBeNull();
      });

      it('旧形式のユーザーを delete できる', async () => {
        await hooks.putRawItem(buildLegacyUserItem());

        await repository.delete('legacy-1');

        expect(await repository.getById('legacy-1')).toBeNull();
      });
    });
  });
}
