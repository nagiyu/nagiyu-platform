/**
 * TickerRepository 契約テスト（実装非依存の振る舞い仕様）
 *
 * InMemory実装と実DynamoDB実装（DynamoDB Local）の双方に同一の仕様を通し、
 * 実装間の乖離（GSI3射影・ソート順・条件式の挙動など）を機械的に検知する。
 * 各テストは決定的で単一の結末を持ち（実行時分岐で結末を変えない・自己スキップしない）、
 * 形骸化テストは書かない。
 *
 * getByExchange は GSI3（ExchangeTickerIndex）に対する正攻法のQueryのため、順序（GSI3SK昇順）を
 * assert する。一方 getAll は InMemory が queryByAttribute（GSIですらない任意属性一致）、
 * 実装側は ScanCommand であり、実DynamoDBのScanは返却順序を保証しない。そのため getAll の順序は
 * assert せず、集合（件数と含まれる要素）としてのみ検証する（ソートしてから比較する）。
 */

import type { TickerRepository } from '../../src/repositories/ticker.repository.interface.js';
import type { CreateTickerInput } from '../../src/entities/ticker.entity.js';
import type { ExchangeRepository } from '../../src/repositories/exchange.repository.interface.js';

/**
 * 契約テストの対象実装が満たすべきフック
 */
export interface TickerRepositoryContractHooks {
  /** テスト対象のリポジトリを生成する（reset の後に呼ばれる） */
  makeRepository: () => Promise<TickerRepository>;
  /**
   * getAll が Ticker 以外のアイテムを拾わないことを検証するために、
   * 同一ストア/テーブルへ Exchange を書き込むための ExchangeRepository を生成する
   */
  makeExchangeRepository: () => Promise<ExchangeRepository>;
  /** 各テスト前にストア／テーブルをクリーンな状態に戻す */
  reset: () => Promise<void>;
  /** 全テスト終了後の後始末（テーブル削除等） */
  teardown?: () => Promise<void>;
}

function buildTickerInput(overrides: Partial<CreateTickerInput> = {}): CreateTickerInput {
  return {
    TickerID: 'NSDQ:AAPL',
    Symbol: 'AAPL',
    Name: 'Apple Inc.',
    ExchangeID: 'NASDAQ',
    ...overrides,
  };
}

function sortByTickerId<T extends { TickerID: string }>(items: T[]): T[] {
  // localeCompareはロケール依存で、異なる文字列に対して0（等価）を返しうるため使わない
  // （例: ロケールによっては大文字小文字や記号の違いを同一視することがある）。
  // ソート順の安定性・決定性を保つため、素のコードユニット比較にする。
  return [...items].sort((a, b) =>
    a.TickerID < b.TickerID ? -1 : a.TickerID > b.TickerID ? 1 : 0
  );
}

/**
 * TickerRepository の契約テストスイートを定義する。
 *
 * @param label - テスト対象実装のラベル（describe名に使用）
 * @param hooks - テスト対象実装を操作するためのフック
 */
export function defineTickerRepositoryContract(
  label: string,
  hooks: TickerRepositoryContractHooks
): void {
  describe(`TickerRepository 契約: ${label}`, () => {
    let repository: TickerRepository;

    beforeEach(async () => {
      await hooks.reset();
      repository = await hooks.makeRepository();
    });

    afterAll(async () => {
      if (hooks.teardown) {
        await hooks.teardown();
      }
    });

    it('create したデータを getById で取得でき、update・delete の結果も反映される', async () => {
      const input = buildTickerInput();

      const created = await repository.create(input);
      expect(created).toMatchObject(input);

      const fetched = await repository.getById(input.TickerID);
      expect(fetched).toEqual(created);

      const updated = await repository.update(input.TickerID, { Name: 'Apple Inc. (Updated)' });
      expect(updated.Name).toBe('Apple Inc. (Updated)');

      await repository.delete(input.TickerID);
      const afterDelete = await repository.getById(input.TickerID);
      expect(afterDelete).toBeNull();
    });

    it('getById は未登録のティッカーに対してnullを返す', async () => {
      expect(await repository.getById('NO-SUCH-TICKER')).toBeNull();
    });

    it('getByExchange は指定取引所のティッカーだけを返す（GSI3パーティション分離）', async () => {
      await repository.create(buildTickerInput({ TickerID: 'NSDQ:AAPL', ExchangeID: 'NASDAQ' }));
      await repository.create(buildTickerInput({ TickerID: 'NSDQ:NVDA', ExchangeID: 'NASDAQ' }));
      await repository.create(buildTickerInput({ TickerID: 'NYSE:BA', ExchangeID: 'NYSE' }));

      const result = await repository.getByExchange('NASDAQ');

      expect(result.items).toHaveLength(2);
      expect(result.items.every((item) => item.ExchangeID === 'NASDAQ')).toBe(true);
    });

    it('getByExchange は挿入順ではなくソートキー（GSI3SK=TICKER#TickerID）の昇順で返す', async () => {
      // 意図的に非ソート順（TSLA→AAPL→NVDA）で作成する
      await repository.create(buildTickerInput({ TickerID: 'TSLA', ExchangeID: 'NASDAQ' }));
      await repository.create(buildTickerInput({ TickerID: 'AAPL', ExchangeID: 'NASDAQ' }));
      await repository.create(buildTickerInput({ TickerID: 'NVDA', ExchangeID: 'NASDAQ' }));

      const result = await repository.getByExchange('NASDAQ');

      expect(result.items.map((item) => item.TickerID)).toEqual(['AAPL', 'NVDA', 'TSLA']);
    });

    it('getByExchange はlimit+cursorのページネーションで重複・欠落なく全件をソートキー昇順に走査できる', async () => {
      const tickerIds = ['E', 'C', 'A', 'D', 'B'];
      for (const tickerId of tickerIds) {
        await repository.create(buildTickerInput({ TickerID: tickerId, ExchangeID: 'NASDAQ' }));
      }

      const collected: string[] = [];
      let cursor: string | undefined;

      do {
        const page = await repository.getByExchange('NASDAQ', { limit: 2, cursor });
        collected.push(...page.items.map((item) => item.TickerID));
        cursor = page.nextCursor;
      } while (cursor);

      expect(collected).toEqual(['A', 'B', 'C', 'D', 'E']);
    });

    it('getAll（オプション未指定）は登録済みの全Tickerを集合として返す（順序は保証しないためソートして比較する）', async () => {
      // 意図的に非ソート順（TSLA→AAPL→NVDA）で作成する
      const created = [
        await repository.create(buildTickerInput({ TickerID: 'TSLA', ExchangeID: 'NASDAQ' })),
        await repository.create(buildTickerInput({ TickerID: 'AAPL', ExchangeID: 'NASDAQ' })),
        await repository.create(buildTickerInput({ TickerID: 'NVDA', ExchangeID: 'NASDAQ' })),
      ];

      const result = await repository.getAll();

      expect(result.nextCursor).toBeUndefined();
      expect(sortByTickerId(result.items)).toEqual(sortByTickerId(created));
    });

    it('getAll はlimit+cursor指定時も重複・欠落なく全件を集合として走査できる（順序は保証しない）', async () => {
      const tickerIds = ['E', 'C', 'A', 'D', 'B'];
      const created = [];
      for (const tickerId of tickerIds) {
        created.push(
          await repository.create(buildTickerInput({ TickerID: tickerId, ExchangeID: 'NASDAQ' }))
        );
      }

      const collected: typeof created = [];
      let cursor: string | undefined;

      do {
        const page = await repository.getAll({ limit: 2, cursor });
        collected.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor);

      expect(collected).toHaveLength(created.length);
      expect(sortByTickerId(collected)).toEqual(sortByTickerId(created));
    });

    it('getAll はTicker以外のアイテム（Exchange等）を含めない', async () => {
      const ticker = await repository.create(buildTickerInput());
      const exchangeRepository = await hooks.makeExchangeRepository();
      await exchangeRepository.create({
        ExchangeID: ticker.ExchangeID,
        Name: 'NASDAQ',
        Key: 'NASDAQ',
        Timezone: 'America/New_York',
        Start: '09:30',
        End: '16:00',
        PriceSource: 'finnhub',
      });

      const result = await repository.getAll();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual(ticker);
    });

    it('同じTickerIDでcreateを重複させるとEntityAlreadyExistsErrorをスローする', async () => {
      const input = buildTickerInput();
      await repository.create(input);

      await expect(repository.create(input)).rejects.toThrow(
        expect.objectContaining({ name: 'EntityAlreadyExistsError' })
      );
    });

    it('存在しない対象へのupdateはEntityNotFoundErrorをスローする', async () => {
      await expect(repository.update('NO-SUCH-TICKER', { Name: 'X' })).rejects.toThrow(
        expect.objectContaining({ name: 'EntityNotFoundError' })
      );
    });

    it('存在しない対象へのdeleteはEntityNotFoundErrorをスローする', async () => {
      await expect(repository.delete('NO-SUCH-TICKER')).rejects.toThrow(
        expect.objectContaining({ name: 'EntityNotFoundError' })
      );
    });
  });
}
