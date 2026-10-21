/**
 * TodoRepository 契約テスト（実装非依存の振る舞い仕様）
 *
 * InMemory実装と実DynamoDB実装（DynamoDB Local）の双方に同一の仕様を通し、
 * 実装間の乖離を機械的に検知する。各テストは決定的で単一の結末を持つ。
 *
 * getByListId の順序は同じパーティション内の SK 昇順（ToDo ID の昇順）で、実 DynamoDB が保証する。
 *
 * getByListId と deleteByListId は全ページを辿る必要がある。実 DynamoDB の Query は件数ではなく
 * 1MB で区切られるため、大きな本文の ToDo を積んで 2 ページ以上にまたがらせる。
 * あわせて BatchWriteItem の上限（1 回 25 件）も、その件数が 25 を超えることでまたぐ。
 *
 * 完了者は、ないときは属性ごと持たない（update で null を渡すと属性が消える）。
 *
 * 旧形式（camelCase の属性名・ISO 文字列の時刻・Type なし）のアイテムは、移行前のデータが
 * 書き込まれるまで残るために読めて、一覧にも出て、更新で新名に置き換わる必要がある。
 */

import type { TodoRepository } from '../../src/repositories/todo/todo-repository.interface.js';
import type { CreateTodoItemInput } from '../../src/types/index.js';
import type { RawStoreHooks } from './helpers/raw-store.js';
import {
  LEGACY_CREATED_AT,
  LEGACY_UPDATED_AT,
  toLegacyTimestamp,
  waitForTimestampAdvance,
} from './helpers/time.js';

/** 契約テストの対象実装が満たすべきフック */
export interface TodoRepositoryContractHooks extends RawStoreHooks {
  /** テスト対象のリポジトリを生成する（reset の後に呼ばれる） */
  makeRepository: () => Promise<TodoRepository>;
}

/**
 * Query が 2 ページ以上にまたがる件数と本文の大きさ。
 * 24KB × 60 件 = 約 1.4MB で 1MB の上限を超え、60 件は BatchWriteItem の 25 件を 3 回に分ける。
 */
const MULTI_PAGE_COUNT = 60;
const MULTI_PAGE_TITLE = 'あ'.repeat(8_000);

function buildTodoInput(overrides: Partial<CreateTodoItemInput> = {}): CreateTodoItemInput {
  return {
    todoId: 'todo-1',
    listId: 'list-1',
    title: '牛乳を買う',
    isCompleted: false,
    createdBy: 'user-1',
    ...overrides,
  };
}

/** 旧形式の ToDo アイテム */
function buildLegacyTodoItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'LIST#list-1',
    SK: 'TODO#legacy-todo',
    todoId: 'legacy-todo',
    listId: 'list-1',
    title: '旧形式',
    isCompleted: true,
    createdBy: 'user-1',
    completedBy: 'user-2',
    createdAt: toLegacyTimestamp(LEGACY_CREATED_AT),
    updatedAt: toLegacyTimestamp(LEGACY_UPDATED_AT),
    ...overrides,
  };
}

function todoIds(todos: Array<{ todoId: string }>): string[] {
  return todos.map((todo) => todo.todoId);
}

function paddedTodoId(index: number): string {
  return `todo-${String(index).padStart(3, '0')}`;
}

/**
 * TodoRepository の契約テストスイートを定義する。
 *
 * @param label - テスト対象実装のラベル（describe名に使用）
 * @param hooks - テスト対象実装を操作するためのフック
 */
export function defineTodoRepositoryContract(
  label: string,
  hooks: TodoRepositoryContractHooks
): void {
  describe(`TodoRepository 契約: ${label}`, () => {
    let repository: TodoRepository;

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
      it('create した ToDo を getById で取得できる', async () => {
        const input = buildTodoInput();

        const created = await repository.create(input);

        expect(created).toMatchObject(input);
        expect(created.completedBy).toBeUndefined();
        expect(typeof created.createdAt).toBe('number');
        // createdAt はリポジトリが、updatedAt は store が別々に現在時刻を読むため、一致は保証されない
        expect(created.updatedAt).toBeGreaterThanOrEqual(created.createdAt);
        expect(await repository.getById('list-1', 'todo-1')).toEqual(created);
      });

      it('保存形式は PascalCase の属性名と数値ミリ秒の時刻で、Type を持ち、完了者がなければ CompletedBy を持たない', async () => {
        const created = await repository.create(buildTodoInput());

        const raw = await hooks.getRawItem('LIST#list-1', 'TODO#todo-1');
        expect(raw).toMatchObject({
          Type: 'TodoItem',
          TodoID: 'todo-1',
          ListID: 'list-1',
          Title: '牛乳を買う',
          IsCompleted: false,
          CreatedBy: 'user-1',
          CreatedAt: created.createdAt,
          UpdatedAt: created.updatedAt,
        });
        expect(raw).not.toHaveProperty('CompletedBy');
        for (const legacyName of [
          'todoId',
          'listId',
          'title',
          'isCompleted',
          'createdBy',
          'completedBy',
          'createdAt',
          'updatedAt',
        ]) {
          expect(raw).not.toHaveProperty(legacyName);
        }
      });

      it('完了者つきで作成すると CompletedBy に保存される', async () => {
        const created = await repository.create(
          buildTodoInput({ isCompleted: true, completedBy: 'user-2' })
        );

        expect(created.completedBy).toBe('user-2');
        expect(await hooks.getRawItem('LIST#list-1', 'TODO#todo-1')).toMatchObject({
          CompletedBy: 'user-2',
        });
      });

      it('getById は存在しない ToDo に対して null を返す', async () => {
        expect(await repository.getById('list-1', 'no-such-todo')).toBeNull();
      });

      it('同じ ToDo ID の重複作成は EntityAlreadyExistsError をスローし、既存の ToDo を変えない', async () => {
        const first = await repository.create(buildTodoInput());

        await expect(repository.create(buildTodoInput({ title: '別の内容' }))).rejects.toThrow(
          expect.objectContaining({ name: 'EntityAlreadyExistsError' })
        );

        expect(await repository.getById('list-1', 'todo-1')).toEqual(first);
      });

      it('update は更新後の Entity を返し、updatedAt が進み、他の項目は変わらない', async () => {
        const created = await repository.create(buildTodoInput());
        await waitForTimestampAdvance();

        const updated = await repository.update('list-1', 'todo-1', { title: '卵を買う' });

        expect(updated).toEqual({ ...created, title: '卵を買う', updatedAt: updated.updatedAt });
        expect(updated.updatedAt).toBeGreaterThan(created.updatedAt);
        expect(await repository.getById('list-1', 'todo-1')).toEqual(updated);
      });

      it('完了にして完了者を設定できる', async () => {
        await repository.create(buildTodoInput());

        const updated = await repository.update('list-1', 'todo-1', {
          isCompleted: true,
          completedBy: 'user-2',
        });

        expect(updated).toMatchObject({ isCompleted: true, completedBy: 'user-2' });
        expect(await repository.getById('list-1', 'todo-1')).toEqual(updated);
      });

      it('update で completedBy に null を渡すと CompletedBy 属性が消え、Entity にも現れない', async () => {
        await repository.create(buildTodoInput({ isCompleted: true, completedBy: 'user-2' }));

        const updated = await repository.update('list-1', 'todo-1', {
          isCompleted: false,
          completedBy: null,
        });

        expect(updated.isCompleted).toBe(false);
        expect(updated.completedBy).toBeUndefined();
        expect(await hooks.getRawItem('LIST#list-1', 'TODO#todo-1')).not.toHaveProperty(
          'CompletedBy'
        );
        expect((await repository.getById('list-1', 'todo-1'))?.completedBy).toBeUndefined();
      });

      it('update で completedBy を省くと完了者は変わらない', async () => {
        await repository.create(buildTodoInput({ isCompleted: true, completedBy: 'user-2' }));

        const updated = await repository.update('list-1', 'todo-1', { title: '卵を買う' });

        expect(updated.completedBy).toBe('user-2');
      });

      it('存在しない ToDo の update は EntityNotFoundError をスローし、アイテムを作らない', async () => {
        await expect(
          repository.update('list-1', 'no-such-todo', { title: '卵を買う' })
        ).rejects.toThrow(expect.objectContaining({ name: 'EntityNotFoundError' }));

        expect(await repository.getById('list-1', 'no-such-todo')).toBeNull();
        expect(await hooks.getRawItem('LIST#list-1', 'TODO#no-such-todo')).toBeUndefined();
      });

      it('delete すると取得できなくなり、他の ToDo は残る', async () => {
        await repository.create(buildTodoInput({ todoId: 'todo-1' }));
        await repository.create(buildTodoInput({ todoId: 'todo-2' }));

        await repository.delete('list-1', 'todo-1');

        expect(await repository.getById('list-1', 'todo-1')).toBeNull();
        expect(await repository.getById('list-1', 'todo-2')).not.toBeNull();
      });

      it('存在しない ToDo の delete は EntityNotFoundError をスローする', async () => {
        await expect(repository.delete('list-1', 'no-such-todo')).rejects.toThrow(
          expect.objectContaining({ name: 'EntityNotFoundError' })
        );
      });
    });

    describe('getByListId', () => {
      it('リストの ToDo だけを、ToDo ID の昇順で返す', async () => {
        // 作成順と ID 順が食い違う順で作り、SK 順で返ることを確かめる
        for (const todoId of ['todo-c', 'todo-a', 'todo-b']) {
          await repository.create(buildTodoInput({ todoId }));
        }
        await repository.create(buildTodoInput({ todoId: 'other', listId: 'list-2' }));

        expect(todoIds(await repository.getByListId('list-1'))).toEqual([
          'todo-a',
          'todo-b',
          'todo-c',
        ]);
      });

      it('ToDo が 1 件もなければ空の配列を返す', async () => {
        expect(await repository.getByListId('list-1')).toEqual([]);
      });

      it('Query が複数ページにまたがる件数でも全件を昇順で返す', async () => {
        for (let index = 0; index < MULTI_PAGE_COUNT; index++) {
          await repository.create(
            buildTodoInput({ todoId: paddedTodoId(index), title: MULTI_PAGE_TITLE })
          );
        }

        const todos = await repository.getByListId('list-1');

        expect(todoIds(todos)).toEqual(
          Array.from({ length: MULTI_PAGE_COUNT }, (_, index) => paddedTodoId(index))
        );
      });
    });

    describe('deleteByListId', () => {
      it('リストの ToDo をすべて削除し、他のリストの ToDo は残す', async () => {
        await repository.create(buildTodoInput({ todoId: 'todo-1' }));
        await repository.create(buildTodoInput({ todoId: 'todo-2' }));
        await repository.create(buildTodoInput({ todoId: 'other', listId: 'list-2' }));

        await repository.deleteByListId('list-1');

        expect(await repository.getByListId('list-1')).toEqual([]);
        expect(todoIds(await repository.getByListId('list-2'))).toEqual(['other']);
      });

      it('ToDo が 1 件もなくても成功する', async () => {
        await expect(repository.deleteByListId('list-1')).resolves.toBeUndefined();
      });

      // BatchWriteItem は 1 回 25 件。ちょうど使い切る件数・1 件超える件数・複数回に分かれる件数で確かめる
      it.each([25, 26, 51])('%i 件の ToDo も全件削除する', async (count) => {
        for (let index = 0; index < count; index++) {
          await repository.create(buildTodoInput({ todoId: paddedTodoId(index) }));
        }
        await repository.create(buildTodoInput({ todoId: 'other', listId: 'list-2' }));

        await repository.deleteByListId('list-1');

        expect(await repository.getByListId('list-1')).toEqual([]);
        expect(todoIds(await repository.getByListId('list-2'))).toEqual(['other']);
      });

      it('Query が複数ページにまたがる件数でも全件削除する', async () => {
        for (let index = 0; index < MULTI_PAGE_COUNT; index++) {
          await repository.create(
            buildTodoInput({ todoId: paddedTodoId(index), title: MULTI_PAGE_TITLE })
          );
        }

        await repository.deleteByListId('list-1');

        expect(await repository.getByListId('list-1')).toEqual([]);
      });
    });

    describe('旧形式のアイテム', () => {
      it('旧形式の ToDo を getById で読める', async () => {
        await hooks.putRawItem(buildLegacyTodoItem());

        expect(await repository.getById('list-1', 'legacy-todo')).toEqual({
          todoId: 'legacy-todo',
          listId: 'list-1',
          title: '旧形式',
          isCompleted: true,
          createdBy: 'user-1',
          completedBy: 'user-2',
          createdAt: LEGACY_CREATED_AT,
          updatedAt: LEGACY_UPDATED_AT,
        });
      });

      it('完了者のない旧形式の ToDo は completedBy が undefined の Entity になる', async () => {
        const legacyItem = buildLegacyTodoItem({ isCompleted: false });
        delete legacyItem.completedBy;
        await hooks.putRawItem(legacyItem);

        expect((await repository.getById('list-1', 'legacy-todo'))?.completedBy).toBeUndefined();
      });

      it('旧形式の ToDo が getByListId に出る（新形式と混在しても ToDo ID の昇順）', async () => {
        await hooks.putRawItem(buildLegacyTodoItem({ SK: 'TODO#b-legacy', todoId: 'b-legacy' }));
        await repository.create(buildTodoInput({ todoId: 'c-new' }));
        await repository.create(buildTodoInput({ todoId: 'a-new' }));

        expect(todoIds(await repository.getByListId('list-1'))).toEqual([
          'a-new',
          'b-legacy',
          'c-new',
        ]);
      });

      it('旧形式の ToDo を update すると、書いた属性が新名になり旧名が消え、再読み込みしても同じ Entity になる', async () => {
        await hooks.putRawItem(buildLegacyTodoItem());
        await waitForTimestampAdvance();

        const updated = await repository.update('list-1', 'legacy-todo', { title: '更新後' });

        expect(updated).toMatchObject({
          todoId: 'legacy-todo',
          title: '更新後',
          isCompleted: true,
          completedBy: 'user-2',
          createdAt: LEGACY_CREATED_AT,
        });
        expect(updated.updatedAt).toBeGreaterThan(LEGACY_UPDATED_AT);

        const raw = await hooks.getRawItem('LIST#list-1', 'TODO#legacy-todo');
        expect(raw).toMatchObject({ Title: '更新後', UpdatedAt: updated.updatedAt });
        expect(raw).not.toHaveProperty('title');
        expect(raw).not.toHaveProperty('updatedAt');
        expect(await repository.getById('list-1', 'legacy-todo')).toEqual(updated);
      });

      it('旧形式の ToDo の完了者を null で消すと、旧名の completedBy も消えて復活しない', async () => {
        await hooks.putRawItem(buildLegacyTodoItem());

        const updated = await repository.update('list-1', 'legacy-todo', {
          isCompleted: false,
          completedBy: null,
        });

        expect(updated.completedBy).toBeUndefined();
        const raw = await hooks.getRawItem('LIST#list-1', 'TODO#legacy-todo');
        expect(raw).not.toHaveProperty('completedBy');
        expect(raw).not.toHaveProperty('CompletedBy');
        expect((await repository.getById('list-1', 'legacy-todo'))?.completedBy).toBeUndefined();
      });

      it('旧形式の ToDo を delete できる', async () => {
        await hooks.putRawItem(buildLegacyTodoItem());

        await repository.delete('list-1', 'legacy-todo');

        expect(await repository.getById('list-1', 'legacy-todo')).toBeNull();
      });

      it('deleteByListId は旧形式の ToDo も削除する', async () => {
        await hooks.putRawItem(buildLegacyTodoItem());
        await repository.create(buildTodoInput());

        await repository.deleteByListId('list-1');

        expect(await repository.getByListId('list-1')).toEqual([]);
      });
    });
  });
}
