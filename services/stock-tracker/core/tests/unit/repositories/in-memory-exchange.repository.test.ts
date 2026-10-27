/**
 * Stock Tracker Core - InMemory Exchange Repository Unit Tests
 *
 * InMemoryExchangeRepositoryのユニットテスト
 */

import { InMemoryExchangeRepository } from '../../../src/repositories/in-memory-exchange.repository.js';
import { InMemorySingleTableStore } from '@nagiyu/aws';
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
        exchangeId: 'NASDAQ',
        name: 'NASDAQ Stock Market',
        key: 'NSDQ',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'tradingview' as const,
      };

      const result = await repository.create(input);

      expect(result).toMatchObject(input);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
      // updatedAt は EntityStore が書き込み時に採番するため、createdAt と同一ミリ秒とは限らない
      expect(result.updatedAt).toBeGreaterThanOrEqual(result.createdAt);
    });

    it('異なるExchangeIDであれば複数作成できる', async () => {
      const input1: CreateExchangeInput = {
        exchangeId: 'NASDAQ',
        name: 'NASDAQ Stock Market',
        key: 'NSDQ',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'tradingview' as const,
      };

      const input2: CreateExchangeInput = {
        exchangeId: 'NYSE',
        name: 'New York Stock Exchange',
        key: 'NYSE',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'tradingview' as const,
      };

      const result1 = await repository.create(input1);
      const result2 = await repository.create(input2);

      expect(result1.exchangeId).toBe('NASDAQ');
      expect(result2.exchangeId).toBe('NYSE');
    });

    it('CreatedAtとUpdatedAtが自動的に設定される', async () => {
      const beforeCreate = Date.now();
      const input: CreateExchangeInput = {
        exchangeId: 'NASDAQ',
        name: 'NASDAQ Stock Market',
        key: 'NSDQ',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'tradingview' as const,
      };
      const result = await repository.create(input);
      const afterCreate = Date.now();

      expect(result.createdAt).toBeGreaterThanOrEqual(beforeCreate);
      expect(result.createdAt).toBeLessThanOrEqual(afterCreate);
      expect(result.updatedAt).toBeGreaterThanOrEqual(beforeCreate);
      expect(result.updatedAt).toBeLessThanOrEqual(afterCreate);
    });
  });

  describe('getById', () => {
    it('存在する取引所を取得できる', async () => {
      const input: CreateExchangeInput = {
        exchangeId: 'NASDAQ',
        name: 'NASDAQ Stock Market',
        key: 'NSDQ',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'tradingview' as const,
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
        exchangeId: 'NASDAQ',
        name: 'NASDAQ Stock Market',
        key: 'NSDQ',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'tradingview' as const,
      };

      await repository.create(input);
      await repository.delete('NASDAQ');
      const result = await repository.getById('NASDAQ');

      expect(result).toBeNull();
    });
  });

  describe('getAllIndexed', () => {
    it('getAll と同じ全件を返す', async () => {
      const base: CreateExchangeInput = {
        exchangeId: 'NASDAQ',
        name: 'NASDAQ Stock Market',
        key: 'NSDQ',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'tradingview' as const,
      };
      await repository.create({ ...base, exchangeId: 'NYSE' });
      await repository.create(base);

      const indexed = await repository.getAllIndexed();
      const all = await repository.getAll();

      expect(indexed.map((e) => e.exchangeId).sort()).toEqual(['NASDAQ', 'NYSE']);
      expect(indexed).toEqual(all);
    });
  });

  describe('getAll', () => {
    it('全ての取引所を取得できる', async () => {
      const input1: CreateExchangeInput = {
        exchangeId: 'NASDAQ',
        name: 'NASDAQ Stock Market',
        key: 'NSDQ',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'tradingview' as const,
      };

      const input2: CreateExchangeInput = {
        exchangeId: 'NYSE',
        name: 'New York Stock Exchange',
        key: 'NYSE',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'tradingview' as const,
      };

      await repository.create(input1);
      await repository.create(input2);

      const result = await repository.getAll();

      expect(result).toHaveLength(2);
      expect(result.map((e) => e.exchangeId)).toContain('NASDAQ');
      expect(result.map((e) => e.exchangeId)).toContain('NYSE');
    });

    it('取引所が存在しない場合は空配列を返す', async () => {
      const result = await repository.getAll();

      expect(result).toEqual([]);
    });

    it('削除された取引所は含まれない', async () => {
      const input1: CreateExchangeInput = {
        exchangeId: 'NASDAQ',
        name: 'NASDAQ Stock Market',
        key: 'NSDQ',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'tradingview' as const,
      };

      const input2: CreateExchangeInput = {
        exchangeId: 'NYSE',
        name: 'New York Stock Exchange',
        key: 'NYSE',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'tradingview' as const,
      };

      await repository.create(input1);
      await repository.create(input2);
      await repository.delete('NYSE');

      const result = await repository.getAll();

      expect(result).toHaveLength(1);
      expect(result[0].exchangeId).toBe('NASDAQ');
    });
  });

  describe('update', () => {
    it('取引所の名前を更新できる', async () => {
      const input: CreateExchangeInput = {
        exchangeId: 'NASDAQ',
        name: 'NASDAQ Stock Market',
        key: 'NSDQ',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'tradingview' as const,
      };

      const created = await repository.create(input);
      // 確実にタイムスタンプが異なるように待機
      await new Promise((resolve) => setTimeout(resolve, 10));
      const updated = await repository.update('NASDAQ', { name: 'NASDAQ Updated' });

      expect(updated.name).toBe('NASDAQ Updated');
      expect(updated.updatedAt).toBeGreaterThan(created.updatedAt);
      expect(updated.createdAt).toBe(created.createdAt);
    });

    it('更新のたびに、引数の exchangeId から作った GSI3 キーを付け直す', async () => {
      await repository.create({
        exchangeId: 'NASDAQ',
        name: 'NASDAQ Stock Market',
        key: 'NSDQ',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'tradingview' as const,
      });
      // GSI3 キー導入前に作られたアイテムを再現する
      const storeKey = { PK: 'EXCHANGE#NASDAQ', SK: 'METADATA' };
      const legacy = { ...store.getByKey(storeKey) };
      delete legacy.GSI3PK;
      delete legacy.GSI3SK;
      store.putByKey(storeKey, legacy);

      await repository.update('NASDAQ', { name: 'NASDAQ Updated' });

      expect(store.getByKey(storeKey)).toMatchObject({
        GSI3PK: 'EXCHANGES',
        GSI3SK: 'EXCHANGE#NASDAQ',
      });
    });

    it('取引所の複数フィールドを更新できる', async () => {
      const input: CreateExchangeInput = {
        exchangeId: 'NASDAQ',
        name: 'NASDAQ Stock Market',
        key: 'NSDQ',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'tradingview' as const,
      };

      await repository.create(input);
      const updated = await repository.update('NASDAQ', {
        name: 'NASDAQ Updated',
        timezone: 'America/Chicago',
        start: '05:00',
        end: '21:00',
      });

      expect(updated.name).toBe('NASDAQ Updated');
      expect(updated.timezone).toBe('America/Chicago');
      expect(updated.start).toBe('05:00');
      expect(updated.end).toBe('21:00');
    });

    it('一部のフィールドだけを更新できる', async () => {
      const input: CreateExchangeInput = {
        exchangeId: 'NASDAQ',
        name: 'NASDAQ Stock Market',
        key: 'NSDQ',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'tradingview' as const,
      };

      await repository.create(input);
      const updated = await repository.update('NASDAQ', {
        name: 'NASDAQ Updated',
      });

      expect(updated.name).toBe('NASDAQ Updated');
      expect(updated.key).toBe('NSDQ'); // 変更されていない
      expect(updated.timezone).toBe('America/New_York'); // 変更されていない
    });
  });

  describe('delete', () => {
    it('取引所を削除できる', async () => {
      const input: CreateExchangeInput = {
        exchangeId: 'NASDAQ',
        name: 'NASDAQ Stock Market',
        key: 'NSDQ',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'tradingview' as const,
      };

      await repository.create(input);
      await repository.delete('NASDAQ');

      const result = await repository.getById('NASDAQ');
      expect(result).toBeNull();
    });
  });

  describe('複数リポジトリでのストア共有', () => {
    it('同じストアを使う複数のリポジトリでデータを共有できる', async () => {
      const repository2 = new InMemoryExchangeRepository(store);

      const input: CreateExchangeInput = {
        exchangeId: 'NASDAQ',
        name: 'NASDAQ Stock Market',
        key: 'NSDQ',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'tradingview' as const,
      };

      await repository.create(input);
      const result = await repository2.getById('NASDAQ');

      expect(result).not.toBeNull();
      expect(result?.exchangeId).toBe('NASDAQ');
    });

    it('異なるリポジトリで更新した内容が反映される', async () => {
      const repository2 = new InMemoryExchangeRepository(store);

      const input: CreateExchangeInput = {
        exchangeId: 'NASDAQ',
        name: 'NASDAQ Stock Market',
        key: 'NSDQ',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'tradingview' as const,
      };

      await repository.create(input);
      await repository2.update('NASDAQ', { name: 'Updated by repository2' });
      const result = await repository.getById('NASDAQ');

      expect(result?.name).toBe('Updated by repository2');
    });
  });

  describe('エッジケース', () => {
    it('長い名前の取引所を作成できる', async () => {
      const input: CreateExchangeInput = {
        exchangeId: 'LONG_ID',
        name: 'A'.repeat(200),
        key: 'LONG',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'tradingview' as const,
      };

      const result = await repository.create(input);

      expect(result.name).toBe('A'.repeat(200));
    });

    it('特殊文字を含む取引所を作成できる', async () => {
      const input: CreateExchangeInput = {
        exchangeId: 'SPECIAL#ID',
        name: 'Special & Exchange (market)',
        key: 'SPEC',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'tradingview' as const,
      };

      const result = await repository.create(input);

      expect(result.exchangeId).toBe('SPECIAL#ID');
      expect(result.name).toBe('Special & Exchange (market)');
    });

    it('多数の取引所を作成・取得できる', async () => {
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          repository.create({
            exchangeId: `EXCHANGE${i}`,
            name: `Exchange ${i}`,
            key: `EX${i}`,
            timezone: 'America/New_York',
            start: '04:00',
            end: '20:00',
            priceSource: 'tradingview',
          })
        );
      }
      await Promise.all(promises);

      const result = await repository.getAll();

      expect(result).toHaveLength(100);
    });
  });

  describe('PriceSource の create/update 反映', () => {
    it('PriceSource が tradingview で作成できる', async () => {
      const input: CreateExchangeInput = {
        exchangeId: 'NASDAQ',
        name: 'NASDAQ Stock Market',
        key: 'NSDQ',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'tradingview',
      };

      const result = await repository.create(input);

      expect(result.priceSource).toBe('tradingview');
    });

    it('PriceSource が finnhub で作成できる', async () => {
      const input: CreateExchangeInput = {
        exchangeId: 'NASDAQ',
        name: 'NASDAQ Stock Market',
        key: 'NSDQ',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'finnhub',
      };

      const result = await repository.create(input);

      expect(result.priceSource).toBe('finnhub');
    });

    it('PriceSource を tradingview から finnhub に更新できる', async () => {
      const input: CreateExchangeInput = {
        exchangeId: 'NASDAQ',
        name: 'NASDAQ Stock Market',
        key: 'NSDQ',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'tradingview',
      };

      await repository.create(input);
      const updated = await repository.update('NASDAQ', { priceSource: 'finnhub' });

      expect(updated.priceSource).toBe('finnhub');
    });

    it('PriceSource を finnhub から tradingview に更新できる', async () => {
      const input: CreateExchangeInput = {
        exchangeId: 'TSE',
        name: '東京証券取引所',
        key: 'TSE',
        timezone: 'Asia/Tokyo',
        start: '09:00',
        end: '15:30',
        priceSource: 'finnhub',
      };

      await repository.create(input);
      const updated = await repository.update('TSE', { priceSource: 'tradingview' });

      expect(updated.priceSource).toBe('tradingview');
    });

    it('PriceSource 更新後も他のフィールドが保持される', async () => {
      const input: CreateExchangeInput = {
        exchangeId: 'NASDAQ',
        name: 'NASDAQ Stock Market',
        key: 'NSDQ',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'tradingview',
      };

      await repository.create(input);
      const updated = await repository.update('NASDAQ', { priceSource: 'finnhub' });

      expect(updated.priceSource).toBe('finnhub');
      expect(updated.name).toBe('NASDAQ Stock Market');
      expect(updated.key).toBe('NSDQ');
      expect(updated.timezone).toBe('America/New_York');
    });
  });

  describe('Market の create/update 反映', () => {
    it('Market を指定せずに作成すると未設定になる', async () => {
      const input: CreateExchangeInput = {
        exchangeId: 'NASDAQ',
        name: 'NASDAQ Stock Market',
        key: 'NSDQ',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'tradingview',
      };

      const result = await repository.create(input);

      expect(result.market).toBeUndefined();
    });

    it('Market が JP で作成できる', async () => {
      const input: CreateExchangeInput = {
        exchangeId: 'TSE',
        name: '東京証券取引所',
        key: 'TSE',
        timezone: 'Asia/Tokyo',
        start: '09:00',
        end: '15:30',
        priceSource: 'tradingview',
        market: 'JP',
      };

      const result = await repository.create(input);

      expect(result.market).toBe('JP');
    });

    it('Market が US で作成できる', async () => {
      const input: CreateExchangeInput = {
        exchangeId: 'NASDAQ',
        name: 'NASDAQ Stock Market',
        key: 'NSDQ',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'finnhub',
        market: 'US',
      };

      const result = await repository.create(input);

      expect(result.market).toBe('US');
    });

    it('未設定の Market を後から設定できる', async () => {
      const input: CreateExchangeInput = {
        exchangeId: 'NASDAQ',
        name: 'NASDAQ Stock Market',
        key: 'NSDQ',
        timezone: 'America/New_York',
        start: '04:00',
        end: '20:00',
        priceSource: 'tradingview',
      };

      await repository.create(input);
      const updated = await repository.update('NASDAQ', { market: 'US' });

      expect(updated.market).toBe('US');
    });

    it('Market を null で更新すると未設定に戻る', async () => {
      const input: CreateExchangeInput = {
        exchangeId: 'TSE',
        name: '東京証券取引所',
        key: 'TSE',
        timezone: 'Asia/Tokyo',
        start: '09:00',
        end: '15:30',
        priceSource: 'tradingview',
        market: 'JP',
      };

      await repository.create(input);
      const updated = await repository.update('TSE', { market: null });

      expect(updated.market).toBeUndefined();
    });

    it('Market を指定しない更新では既存の値が保持される', async () => {
      const input: CreateExchangeInput = {
        exchangeId: 'TSE',
        name: '東京証券取引所',
        key: 'TSE',
        timezone: 'Asia/Tokyo',
        start: '09:00',
        end: '15:30',
        priceSource: 'tradingview',
        market: 'JP',
      };

      await repository.create(input);
      const updated = await repository.update('TSE', { name: '東証' });

      expect(updated.market).toBe('JP');
    });

    it('Market 更新後も他のフィールドが保持される', async () => {
      const input: CreateExchangeInput = {
        exchangeId: 'TSE',
        name: '東京証券取引所',
        key: 'TSE',
        timezone: 'Asia/Tokyo',
        start: '09:00',
        end: '15:30',
        priceSource: 'tradingview',
        market: 'JP',
      };

      await repository.create(input);
      const updated = await repository.update('TSE', { market: null });

      expect(updated.market).toBeUndefined();
      expect(updated.name).toBe('東京証券取引所');
      expect(updated.priceSource).toBe('tradingview');
    });
  });
});
