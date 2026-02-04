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

    it('同じIDの取引所を作成しようとするとEntityAlreadyExistsErrorをスローする', async () => {
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

    it('存在しない取引所の場合はnullを返す', async () => {
      const result = await repository.getById('NYSE');

      expect(result).toBeNull();
    });
  });

  describe('getAll', () => {
    it('全取引所を取得できる', async () => {
      const exchange1: CreateExchangeInput = {
        ExchangeID: 'NASDAQ',
        Name: 'NASDAQ Stock Market',
        Key: 'NSDQ',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
      };

      const exchange2: CreateExchangeInput = {
        ExchangeID: 'NYSE',
        Name: 'New York Stock Exchange',
        Key: 'NYSE',
        Timezone: 'America/New_York',
        Start: '04:00',
        End: '20:00',
      };

      await repository.create(exchange1);
      await repository.create(exchange2);

      const result = await repository.getAll();

      expect(result).toHaveLength(2);
      expect(result[0].ExchangeID).toBe('NASDAQ');
      expect(result[1].ExchangeID).toBe('NYSE');
    });

    it('取引所が存在しない場合は空配列を返す', async () => {
      const result = await repository.getAll();

      expect(result).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('取引所を更新できる', async () => {
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

      const result = await repository.update('NASDAQ', {
        Name: 'NASDAQ (Updated)',
        Start: '04:30',
      });

      expect(result.Name).toBe('NASDAQ (Updated)');
      expect(result.Start).toBe('04:30');
      expect(result.End).toBe('20:00'); // 更新されていないフィールド
      expect(result.UpdatedAt).toBeGreaterThan(result.CreatedAt);
    });

    it('存在しない取引所を更新しようとするとEntityNotFoundErrorをスローする', async () => {
      await expect(
        repository.update('NYSE', { Name: 'NYSE (Updated)' })
      ).rejects.toThrow(EntityNotFoundError);
    });

    it('更新するフィールドがない場合はDatabaseErrorをスローする', async () => {
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

    it('存在しない取引所を削除しようとするとEntityNotFoundErrorをスローする', async () => {
      await expect(repository.delete('NYSE')).rejects.toThrow(EntityNotFoundError);
    });
  });
});
