import { InvalidEntityDataError, REMOVE_ATTRIBUTE } from '@nagiyu/aws';
import { TodoItemMapper } from '../../../../src/repositories/todo/todo-item-mapper.js';
import type { TodoItem } from '../../../../src/types/index.js';

const CREATED_AT = 1704067200000;
const UPDATED_AT = 1704067300000;

function buildTodo(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    todoId: 'todo-1',
    listId: 'list-1',
    title: '牛乳を買う',
    isCompleted: false,
    createdBy: 'user-1',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'LIST#list-1',
    SK: 'TODO#todo-1',
    Type: 'TodoItem',
    TodoID: 'todo-1',
    ListID: 'list-1',
    Title: '牛乳を買う',
    IsCompleted: false,
    CreatedBy: 'user-1',
    CreatedAt: CREATED_AT,
    UpdatedAt: UPDATED_AT,
    ...overrides,
  };
}

function buildLegacyItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'LIST#list-1',
    SK: 'TODO#todo-1',
    todoId: 'todo-1',
    listId: 'list-1',
    title: '牛乳を買う',
    isCompleted: false,
    createdBy: 'user-1',
    createdAt: new Date(CREATED_AT).toISOString(),
    updatedAt: new Date(UPDATED_AT).toISOString(),
    ...overrides,
  };
}

describe('TodoItemMapper', () => {
  const mapper = new TodoItemMapper();

  it('entityType は TodoItem になる', () => {
    expect(mapper.entityType).toBe('TodoItem');
  });

  it('buildKeys は PK を先頭にした PK/SK を返す', () => {
    const keys = mapper.buildKeys({ listId: 'list-1', todoId: 'todo-1' });
    expect(keys).toEqual({ PK: 'LIST#list-1', SK: 'TODO#todo-1' });
    expect(Object.keys(keys)[0]).toBe('PK');
  });

  it('getKey は Entity からビジネスキーを取り出す', () => {
    expect(mapper.getKey(buildTodo())).toEqual({ listId: 'list-1', todoId: 'todo-1' });
  });

  it('toItem は保存形式 (PascalCase・数値ミリ秒・Type) の Item に変換する', () => {
    expect(mapper.toItem(buildTodo())).toEqual(buildItem());
  });

  it('toItem は completedBy がないとき CompletedBy のキー自体を持たない', () => {
    expect(Object.prototype.hasOwnProperty.call(mapper.toItem(buildTodo()), 'CompletedBy')).toBe(
      false
    );
  });

  it('toItem は completedBy を CompletedBy に変換する', () => {
    expect(mapper.toItem(buildTodo({ isCompleted: true, completedBy: 'user-2' }))).toEqual(
      buildItem({ IsCompleted: true, CompletedBy: 'user-2' })
    );
  });

  describe('toEntity', () => {
    it.each([
      ['未完了', buildTodo()],
      ['完了', buildTodo({ isCompleted: true, completedBy: 'user-2' })],
    ])('新形式の Item を往復で変換できる (%s)', (_label, todo) => {
      expect(mapper.toEntity(mapper.toItem(todo))).toEqual(todo);
    });

    it('PK/SK/Type を Entity に含めない', () => {
      const entity = mapper.toEntity(buildItem());
      for (const name of ['PK', 'SK', 'Type']) {
        expect(entity).not.toHaveProperty(name);
      }
    });

    it('CompletedBy がない Item では completedBy のキーを持たない', () => {
      expect(mapper.toEntity(buildItem())).not.toHaveProperty('completedBy');
    });

    it('旧形式 (camelCase の属性名と ISO 文字列の時刻) を読める', () => {
      expect(mapper.toEntity(buildLegacyItem())).toEqual(buildTodo());
    });

    it('旧形式の completedBy を読める', () => {
      expect(
        mapper.toEntity(buildLegacyItem({ isCompleted: true, completedBy: 'user-2' }))
      ).toEqual(buildTodo({ isCompleted: true, completedBy: 'user-2' }));
    });

    it('新名が旧名より優先される', () => {
      expect(mapper.toEntity(buildItem({ title: '旧名' })).title).toBe('牛乳を買う');
    });

    it('空の title は許容する', () => {
      expect(mapper.toEntity(buildItem({ Title: '' })).title).toBe('');
    });

    it.each(['TodoID', 'ListID'])(
      '%s が空の Item は InvalidEntityDataError をスローする',
      (name) => {
        expect(() => mapper.toEntity(buildItem({ [name]: '' }))).toThrow(InvalidEntityDataError);
      }
    );

    it.each(['TodoID', 'ListID', 'Title', 'IsCompleted', 'CreatedBy', 'CreatedAt', 'UpdatedAt'])(
      '必須の %s がない Item は InvalidEntityDataError をスローする',
      (attribute) => {
        expect(() => mapper.toEntity(buildItem({ [attribute]: undefined }))).toThrow(
          InvalidEntityDataError
        );
      }
    );

    it('IsCompleted が真偽値でない Item は InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toEntity(buildItem({ IsCompleted: 'true' }))).toThrow(
        InvalidEntityDataError
      );
    });

    it('CompletedBy が文字列でない Item は InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toEntity(buildItem({ CompletedBy: 1 }))).toThrow(InvalidEntityDataError);
    });

    it('時刻が不正な Item は InvalidEntityDataError をスローする', () => {
      expect(() => mapper.toEntity(buildItem({ CreatedAt: 'invalid' }))).toThrow(
        InvalidEntityDataError
      );
    });
  });

  describe('toUpdateAttributes', () => {
    it('title / isCompleted / completedBy を保存用の属性名に変換し、他の項目は含めない', () => {
      const attributes = mapper.toUpdateAttributes({
        title: '新しい',
        isCompleted: true,
        completedBy: 'user-2',
      });
      expect(attributes.Title).toBe('新しい');
      expect(attributes.IsCompleted).toBe(true);
      expect(attributes.CompletedBy).toBe('user-2');
      expect(attributes.TodoID).toBeUndefined();
      expect(attributes).not.toHaveProperty('PK');
      expect(attributes).not.toHaveProperty('SK');
    });

    it('completedBy が undefined なら変更しない', () => {
      expect(mapper.toUpdateAttributes({ isCompleted: true }).CompletedBy).toBeUndefined();
    });

    it('completedBy が null なら属性の削除を指示する', () => {
      expect(mapper.toUpdateAttributes({ completedBy: null }).CompletedBy).toBe(REMOVE_ATTRIBUTE);
    });

    it.each([
      ['title', { title: null }],
      ['isCompleted', { isCompleted: null }],
    ] as const)(
      '必須項目 %s を null にすると InvalidEntityDataError をスローする',
      (_f, changes) => {
        expect(() => mapper.toUpdateAttributes(changes)).toThrow(InvalidEntityDataError);
      }
    );

    it.each([
      ['todoId', { todoId: 'todo-1' }],
      ['listId', { listId: 'list-1' }],
      ['createdBy', { createdBy: 'user-1' }],
      ['createdAt', { createdAt: CREATED_AT }],
    ] as const)(
      '変更不可の項目 %s を含めると、値が同じでも InvalidEntityDataError をスローする',
      (_field, changes) => {
        expect(() => mapper.toUpdateAttributes(changes)).toThrow(InvalidEntityDataError);
      }
    );
  });

  it('legacyAttributeNames は新名から旧名への対応を宣言する', () => {
    expect(mapper.legacyAttributeNames.TodoID).toEqual(['todoId']);
    expect(mapper.legacyAttributeNames.CompletedBy).toEqual(['completedBy']);
    expect(mapper.legacyAttributeNames.UpdatedAt).toEqual(['updatedAt']);
  });
});
