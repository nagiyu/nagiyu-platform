/**
 * ExchangeRepository 契約テスト（実装非依存の振る舞い仕様）
 *
 * InMemory実装と実DynamoDB実装（DynamoDB Local）の双方に同一の仕様を通し、
 * 実装間の乖離（Scanフィルタ・条件式の挙動など）を機械的に検知する。
 * 各テストは決定的で単一の結末を持ち（実行時分岐で結末を変えない・自己スキップしない）、
 * 形骸化テストは書かない。
 *
 * getAll は InMemory が queryByAttribute（GSIですらない任意属性一致）、実装側は ScanCommand
 * であり、実DynamoDBのScanは返却順序を保証しない。そのため getAll の順序は assert せず、
 * 集合（件数と含まれる要素）としてのみ検証する（ソートしてから比較する）。
 */

import type { ExchangeRepository } from '../../src/repositories/exchange.repository.interface.js';
import type { CreateExchangeInput } from '../../src/entities/exchange.entity.js';
import type { TickerRepository } from '../../src/repositories/ticker.repository.interface.js';

/**
 * 契約テストの対象実装が満たすべきフック
 */
export interface ExchangeRepositoryContractHooks {
  /** テスト対象のリポジトリを生成する（reset の後に呼ばれる） */
  makeRepository: () => Promise<ExchangeRepository>;
  /**
   * getAll が Exchange 以外のアイテムを拾わないことを検証するために、
   * 同一ストア/テーブルへ Ticker を書き込むための TickerRepository を生成する
   */
  makeTickerRepository: () => Promise<TickerRepository>;
  /** 各テスト前にストア／テーブルをクリーンな状態に戻す */
  reset: () => Promise<void>;
  /** 全テスト終了後の後始末（テーブル削除等） */
  teardown?: () => Promise<void>;
}

function buildExchangeInput(overrides: Partial<CreateExchangeInput> = {}): CreateExchangeInput {
  return {
    ExchangeID: 'NASDAQ',
    Name: 'NASDAQ',
    Key: 'NASDAQ',
    Timezone: 'America/New_York',
    Start: '09:30',
    End: '16:00',
    PriceSource: 'finnhub',
    ...overrides,
  };
}

function sortByExchangeId<T extends { ExchangeID: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.ExchangeID.localeCompare(b.ExchangeID));
}

/**
 * ExchangeRepository の契約テストスイートを定義する。
 *
 * @param label - テスト対象実装のラベル（describe名に使用）
 * @param hooks - テスト対象実装を操作するためのフック
 */
export function defineExchangeRepositoryContract(
  label: string,
  hooks: ExchangeRepositoryContractHooks
): void {
  describe(`ExchangeRepository 契約: ${label}`, () => {
    let repository: ExchangeRepository;

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
      const input = buildExchangeInput();

      const created = await repository.create(input);
      expect(created).toMatchObject(input);

      const fetched = await repository.getById(input.ExchangeID);
      expect(fetched).toEqual(created);

      const updated = await repository.update(input.ExchangeID, { Name: 'NASDAQ Global Select' });
      expect(updated.Name).toBe('NASDAQ Global Select');

      await repository.delete(input.ExchangeID);
      const afterDelete = await repository.getById(input.ExchangeID);
      expect(afterDelete).toBeNull();
    });

    it('getById は未登録の取引所に対してnullを返す', async () => {
      expect(await repository.getById('NO-SUCH-EXCHANGE')).toBeNull();
    });

    it('getAll は登録済みの全Exchangeを集合として返す（順序は保証しないためソートして比較する）', async () => {
      // 意図的に非ソート順（NYSE→NASDAQ→AMEX）で作成する
      const created = [
        await repository.create(buildExchangeInput({ ExchangeID: 'NYSE', Name: 'NYSE' })),
        await repository.create(buildExchangeInput({ ExchangeID: 'NASDAQ', Name: 'NASDAQ' })),
        await repository.create(buildExchangeInput({ ExchangeID: 'AMEX', Name: 'AMEX' })),
      ];

      const result = await repository.getAll();

      expect(sortByExchangeId(result)).toEqual(sortByExchangeId(created));
    });

    it('getAll はExchange以外のアイテム（Ticker等）を含めない', async () => {
      const exchange = await repository.create(buildExchangeInput());
      const tickerRepository = await hooks.makeTickerRepository();
      await tickerRepository.create({
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: exchange.ExchangeID,
      });

      const result = await repository.getAll();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(exchange);
    });

    it('同じExchangeIDでcreateを重複させるとEntityAlreadyExistsErrorをスローする', async () => {
      const input = buildExchangeInput();
      await repository.create(input);

      await expect(repository.create(input)).rejects.toThrow(
        expect.objectContaining({ name: 'EntityAlreadyExistsError' })
      );
    });

    it('存在しない対象へのupdateはEntityNotFoundErrorをスローする', async () => {
      await expect(repository.update('NO-SUCH-EXCHANGE', { Name: 'X' })).rejects.toThrow(
        expect.objectContaining({ name: 'EntityNotFoundError' })
      );
    });

    it('存在しない対象へのdeleteはEntityNotFoundErrorをスローする', async () => {
      await expect(repository.delete('NO-SUCH-EXCHANGE')).rejects.toThrow(
        expect.objectContaining({ name: 'EntityNotFoundError' })
      );
    });
  });
}
