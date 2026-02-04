/**
 * Stock Tracker Core - InMemory Exchange Repository Unit Tests
 *
 * InMemoryExchangeRepositoryのユニットテスト
 */

import { InMemoryExchangeRepository } from '../../../src/repositories/in-memory-exchange.repository.js';
import {
  InMemorySingleTableStore,
  EntityAlreadyExistsError,
  EntityNotFoundError,
  DatabaseError,
} from '@nagiyu/aws';
import type { CreateExchangeInput } from '../../../src/entities/exchange.entity.js';

describe('InMemoryExchangeRepository', () => {
  let repository: InMemoryExchangeRepository;
  let store: InMemorySingleTableStore;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repository = new InMemoryExchangeRepository(store);
  });

  describe('create', () => {
    it('新しい取引所を作成できる', async () => {
      const input: CreateExchangeInput = {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
      };

      const result = await repository.create(input);

      expect(result).toMatchObject(input);
      expect(result.CreatedAt).toBeDefined();
      expect(result.UpdatedAt).toBeDefined();
      expect(result.CreatedAt).toBe(result.UpdatedAt);
    });

    it('同じExchangeIDの取引所が既に存在する場合はEntityAlreadyExistsErrorをスローする', async () => {
      const input: CreateExchangeInput = {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
      };

      await repository.create(input);

      await expect(repository.create(input)).rejects.toThrow(EntityAlreadyExistsError);
    });

    it('異なるExchangeIDであれば複数作成できる', async () => {
      const input1: CreateExchangeInput = {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
      };

      const input2: CreateExchangeInput = {
        ExchangeID: 'NYSE',
        Name: 'New York Stock Exchange',
        Key: 'NYSE',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
      };

      const result1 = await repository.create(input1);
      const result2 = await repository.create(input2);

      expect(result1.ExchangeID).toBe('NASDAQ');
      expect(result2.ExchangeID).toBe('NYSE');
    });

    it('CreatedAtとUpdatedAtが自動的に設定される', async () => {
      const beforeCreate = Date.now();
      const input: CreateExchangeInput = {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
      };
      const result = await repository.create(input);
      const afterCreate = Date.now();

      expect(result.CreatedAt).toBeGreaterThanOrEqual(beforeCreate);
      expect(result.CreatedAt).toBeLessThanOrEqual(afterCreate);
      expect(result.UpdatedAt).toBeGreaterThanOrEqual(beforeCreate);
      expect(result.UpdatedAt).toBeLessThanOrEqual(afterCreate);
    });
  });

  describe('getById', () => {
    it('存在する取引所を取得できる', async () => {
      const input: CreateExchangeInput = {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
      };

      const created = await repository.create(input);
      const result = await repository.getById('NASDAQ');

      expect(result).toEqual(created);
    });

    it('存在しない取引所を取得した場合はnullを返す', async () => {
      const result = await repository.getById('NONEXISTENT');

      expect(result).toBeNull();
    });

    it('削除された取引所は取得できない', async () => {
      const input: CreateExchangeInput = {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
      };

      await repository.create(input);
      await repository.delete('NASDAQ');
      const result = await repository.getById('NASDAQ');

      expect(result).toBeNull();
    });
  });

  describe('getAll', () => {
    it('全ての取引所を取得できる', async () => {
      const input1: CreateExchangeInput = {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
      };

      const input2: CreateExchangeInput = {
        ExchangeID: 'NYSE',
        Name: 'New York Stock Exchange',
        Key: 'NYSE',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
      };

      await repository.create(input1);
      await repository.create(input2);

      const result = await repository.getAll();

      expect(result).toHaveLength(2);
      expect(result.map((e) => e.ExchangeID)).toContain('NASDAQ');
      expect(result.map((e) => e.ExchangeID)).toContain('NYSE');
    });

    it('取引所が存在しない場合は空配列を返す', async () => {
      const result = await repository.getAll();

      expect(result).toEqual([]);
    });

    it('削除された取引所は含まれない', async () => {
      const input1: CreateExchangeInput = {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
      };

      const input2: CreateExchangeInput = {
        ExchangeID: 'NYSE',
        Name: 'New York Stock Exchange',
        Key: 'NYSE',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
      };

      await repository.create(input1);
      await repository.create(input2);
      await repository.delete('NYSE');

      const result = await repository.getAll();

      expect(result).toHaveLength(1);
      expect(result[0].ExchangeID).toBe('NASDAQ');
    });
  });

  describe('update', () => {
    it('取引所の名前を更新できる', async () => {
      const input: CreateExchangeInput = {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
      };

      const created = await repository.create(input);
      // 確実にタイムスタンプが異なるように待機
      await new Promise((resolve) => setTimeout(resolve, 10));
      const updated = await repository.update('NASDAQ', { Name: 'NASDAQ Updated' });

      expect(updated.Name).toBe('NASDAQ Updated');
      expect(updated.UpdatedAt).toBeGreaterThan(created.UpdatedAt);
      expect(updated.CreatedAt).toBe(created.CreatedAt);
    });

    it('取引所の複数フィールドを更新できる', async () => {
      const input: CreateExchangeInput = {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
      };

      await repository.create(input);
      const updated = await repository.update('NASDAQ', {
        Name: 'NASDAQ Updated',
        Timezone: 'America/Chicago',
        Start: '05:00',
        End: '21:00',
      });

      expect(updated.Name).toBe('NASDAQ Updated');
      expect(updated.Timezone).toBe('America/Chicago');
      expect(updated.Start).toBe('05:00');
      expect(updated.End).toBe('21:00');
    });

    it('存在しない取引所を更新しようとした場合はEntityNotFoundErrorをスローする', async () => {
      await expect(repository.update('NONEXISTENT', { Name: 'Updated' })).rejects.toThrow(
        EntityNotFoundError
      );
    });

    it('更新するフィールドが指定されていない場合はDatabaseErrorをスローする', async () => {
      const input: CreateExchangeInput = {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
      };

      await repository.create(input);

      await expect(repository.update('NASDAQ', {})).rejects.toThrow(DatabaseError);
    });

    it('一部のフィールドだけを更新できる', async () => {
      const input: CreateExchangeInput = {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
      };

      await repository.create(input);
      const updated = await repository.update('NASDAQ', {
        Name: 'NASDAQ Updated',
      });

      expect(updated.Name).toBe('NASDAQ Updated');
      expect(updated.Key).toBe('NSDQ'); // 変更されていない
      expect(updated.Timezone).toBe('America/New_York'); // 変更されていない
    });

    it('UpdatedAtのみが更新される', async () => {
      const input: CreateExchangeInput = {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
      };

      const created = await repository.create(input);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const updated = await repository.update('NASDAQ', { Name: 'Updated' });

      expect(updated.CreatedAt).toBe(created.CreatedAt);
      expect(updated.UpdatedAt).toBeGreaterThan(created.UpdatedAt);
    });
  });

  describe('delete', () => {
    it('取引所を削除できる', async () => {
      const input: CreateExchangeInput = {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
      };

      await repository.create(input);
      await repository.delete('NASDAQ');

      const result = await repository.getById('NASDAQ');
      expect(result).toBeNull();
    });

    it('存在しない取引所を削除しようとした場合はEntityNotFoundErrorをスローする', async () => {
      await expect(repository.delete('NONEXISTENT')).rejects.toThrow(EntityNotFoundError);
    });

    it('削除後、同じIDで再度作成できる', async () => {
      const input: CreateExchangeInput = {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
      };

      await repository.create(input);
      await repository.delete('NASDAQ');
      const recreated = await repository.create(input);

      expect(recreated.ExchangeID).toBe('NASDAQ');
      expect(recreated.Name).toBe('NASDAQ Stock Market');
    });
  });

  describe('複数リポジトリでのストア共有', () => {
    it('同じストアを使う複数のリポジトリでデータを共有できる', async () => {
      const repository2 = new InMemoryExchangeRepository(store);

      const input: CreateExchangeInput = {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
      };

      await repository.create(input);
      const result = await repository2.getById('NASDAQ');

      expect(result).not.toBeNull();
      expect(result?.ExchangeID).toBe('NASDAQ');
    });

    it('異なるリポジトリで更新した内容が反映される', async () => {
      const repository2 = new InMemoryExchangeRepository(store);

      const input: CreateExchangeInput = {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
      };

      await repository.create(input);
      await repository2.update('NASDAQ', { Name: 'Updated by repository2' });
      const result = await repository.getById('NASDAQ');

      expect(result?.Name).toBe('Updated by repository2');
    });
  });

  describe('エッジケース', () => {
    it('長い名前の取引所を作成できる', async () => {
      const input: CreateExchangeInput = {
        ExchangeID: 'LONG_ID',
        Name: 'A'.repeat(200),
        Key: 'LONG',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
      };

      const result = await repository.create(input);

      expect(result.Name).toBe('A'.repeat(200));
    });

    it('特殊文字を含む取引所を作成できる', async () => {
      const input: CreateExchangeInput = {
        ExchangeID: 'SPECIAL#ID',
        Name: 'Special & Exchange (Market)',
        Key: 'SPEC',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
      };

      const result = await repository.create(input);

      expect(result.ExchangeID).toBe('SPECIAL#ID');
      expect(result.Name).toBe('Special & Exchange (Market)');
    });

    it('空のKeyやTimezoneも保存できる', async () => {
      const input: CreateExchangeInput = {
        ExchangeID: 'TEST',
        Name: 'Test Exchange',
        Key: '',
        Timezone: '',
        Start: '00:00',
        End: '24:00',
      };

      const result = await repository.create(input);

      expect(result.Key).toBe('');
      expect(result.Timezone).toBe('');
    });

    it('多数の取引所を作成・取得できる', async () => {
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          repository.create({
            ExchangeID: `EXCHANGE${i}`,
            Name: `Exchange ${i}`,
            Key: `EX${i}`,
            Timezone: 'America/New_York',
            Start: '04:00',
            End: '20:00',
          })
        );
      }
      await Promise.all(promises);

      const result = await repository.getAll();

      expect(result).toHaveLength(100);
    });
  });

  describe('delete - error handling', () => {
    it('削除時に予期しないエラーが発生した場合は再スローする', async () => {
      const unexpectedError = new Error('Unexpected store error');
      jest.spyOn(store, 'delete').mockImplementationOnce(() => {
        throw unexpectedError;
      });

      const input: CreateExchangeInput = {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
      };

      await repository.create(input);

      await expect(repository.delete('NASDAQ')).rejects.toThrow('Unexpected store error');
    });
  });
});
