import {
  sortListsByCreatedAt,
  sortPersonalLists,
  sortTodosByCreatedAt,
} from '../../../src/libs/sort.js';

describe('sort', () => {
  describe('sortTodosByCreatedAt', () => {
    it('順不同の入力を createdAt の古い順に並べる', () => {
      const result = sortTodosByCreatedAt([
        { todoId: 'c', createdAt: 300 },
        { todoId: 'a', createdAt: 100 },
        { todoId: 'b', createdAt: 200 },
      ]);

      expect(result.map((t) => t.todoId)).toEqual(['a', 'b', 'c']);
    });

    it('createdAt が同じ場合は todoId の文字列比較で決める', () => {
      const result = sortTodosByCreatedAt([
        { todoId: 'b', createdAt: 100 },
        { todoId: 'a', createdAt: 100 },
        { todoId: 'b', createdAt: 100 },
      ]);

      expect(result.map((t) => t.todoId)).toEqual(['a', 'b', 'b']);
    });

    it('入力配列を破壊しない', () => {
      const input = [
        { todoId: 'b', createdAt: 200 },
        { todoId: 'a', createdAt: 100 },
      ];

      const result = sortTodosByCreatedAt(input);

      expect(result).not.toBe(input);
      expect(input.map((t) => t.todoId)).toEqual(['b', 'a']);
    });
  });

  describe('sortListsByCreatedAt', () => {
    it('createdAt の古い順に並べ、同時刻は listId で決める', () => {
      const result = sortListsByCreatedAt([
        { listId: 'z', createdAt: 200 },
        { listId: 'b', createdAt: 100 },
        { listId: 'a', createdAt: 100 },
      ]);

      expect(result.map((l) => l.listId)).toEqual(['a', 'b', 'z']);
    });
  });

  describe('sortPersonalLists', () => {
    it('デフォルトリストを先頭にし、残りを createdAt の古い順に並べる', () => {
      const input = [
        { listId: 'x', isDefault: false, createdAt: 100 },
        { listId: 'd', isDefault: true, createdAt: 300 },
        { listId: 'y', isDefault: false, createdAt: 200 },
      ];

      const result = sortPersonalLists(input);

      expect(result.map((l) => l.listId)).toEqual(['d', 'x', 'y']);
      expect(input.map((l) => l.listId)).toEqual(['x', 'd', 'y']);
    });
  });
});
