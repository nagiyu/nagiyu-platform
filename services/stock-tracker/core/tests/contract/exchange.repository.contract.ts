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
    exchangeId: 'NASDAQ',
    name: 'NASDAQ',
    key: 'NASDAQ',
    timezone: 'America/New_York',
    start: '09:30',
    end: '16:00',
    priceSource: 'finnhub',
    ...overrides,
  };
}

function sortByExchangeId<T extends { exchangeId: string }>(items: T[]): T[] {
  // localeCompareはロケール依存で、異なる文字列に対して0（等価）を返しうるため使わない
  // （例: ロケールによっては大文字小文字や記号の違いを同一視することがある）。
  // ソート順の安定性・決定性を保つため、素のコードユニット比較にする。
  return [...items].sort((a, b) =>
    a.exchangeId < b.exchangeId ? -1 : a.exchangeId > b.exchangeId ? 1 : 0
  );
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

      const fetched = await repository.getById(input.exchangeId);
      expect(fetched).toEqual(created);

      const updated = await repository.update(input.exchangeId, { name: 'NASDAQ Global Select' });
      expect(updated.name).toBe('NASDAQ Global Select');

      await repository.delete(input.exchangeId);
      const afterDelete = await repository.getById(input.exchangeId);
      expect(afterDelete).toBeNull();
    });

    it('空の変更で update しても成功し、更新日時だけが進む', async () => {
      const created = await repository.create(buildExchangeInput({ market: 'JP' }));
      // 同じミリ秒内に収まらないよう、更新日時が進む時間だけ待つ
      await new Promise((resolve) => setTimeout(resolve, 5));

      const updated = await repository.update(created.exchangeId, {});

      expect(updated).toEqual({ ...created, updatedAt: updated.updatedAt });
      expect(updated.updatedAt).toBeGreaterThan(created.updatedAt);
    });

    it('getById は未登録の取引所に対してnullを返す', async () => {
      expect(await repository.getById('NO-SUCH-EXCHANGE')).toBeNull();
    });

    it('getAll は登録済みの全Exchangeを集合として返す（順序は保証しないためソートして比較する）', async () => {
      // 意図的に非ソート順（NYSE→NASDAQ→AMEX）で作成する
      const created = [
        await repository.create(buildExchangeInput({ exchangeId: 'NYSE', name: 'NYSE' })),
        await repository.create(buildExchangeInput({ exchangeId: 'NASDAQ', name: 'NASDAQ' })),
        await repository.create(buildExchangeInput({ exchangeId: 'AMEX', name: 'AMEX' })),
      ];

      const result = await repository.getAll();

      expect(sortByExchangeId(result)).toEqual(sortByExchangeId(created));
    });

    it('getAll はExchange以外のアイテム（Ticker等）を含めない', async () => {
      const exchange = await repository.create(buildExchangeInput());
      const tickerRepository = await hooks.makeTickerRepository();
      await tickerRepository.create({
        tickerId: 'NSDQ:AAPL',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        exchangeId: exchange.exchangeId,
      });

      const result = await repository.getAll();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(exchange);
    });

    it('getAllIndexed は登録済みの全Exchangeを集合として返す', async () => {
      const created = [
        await repository.create(buildExchangeInput({ exchangeId: 'NYSE', name: 'NYSE' })),
        await repository.create(buildExchangeInput({ exchangeId: 'NASDAQ', name: 'NASDAQ' })),
      ];

      const result = await repository.getAllIndexed();

      expect(sortByExchangeId(result)).toEqual(sortByExchangeId(created));
    });

    it('getAllIndexed は取引所が0件なら空配列を返す', async () => {
      expect(await repository.getAllIndexed()).toEqual([]);
    });

    it('getAll は100件超のExchangeがあってもページ境界をまたいで全件を取りこぼさない（打ち切りの回帰防止）', async () => {
      const total = 130;
      const created: Awaited<ReturnType<ExchangeRepository['create']>>[] = [];
      for (let i = 0; i < total; i += 1) {
        created.push(
          await repository.create(
            buildExchangeInput({ exchangeId: `EX${String(i).padStart(4, '0')}` })
          )
        );
      }

      const result = await repository.getAll();

      expect(sortByExchangeId(result)).toEqual(sortByExchangeId(created));
    });

    it('同じExchangeIDでcreateを重複させるとEntityAlreadyExistsErrorをスローする', async () => {
      const input = buildExchangeInput();
      await repository.create(input);

      await expect(repository.create(input)).rejects.toThrow(
        expect.objectContaining({ name: 'EntityAlreadyExistsError' })
      );
    });

    it('存在しない対象へのupdateはEntityNotFoundErrorをスローする', async () => {
      await expect(repository.update('NO-SUCH-EXCHANGE', { name: 'X' })).rejects.toThrow(
        expect.objectContaining({ name: 'EntityNotFoundError' })
      );
    });

    it('存在しない対象へのdeleteはEntityNotFoundErrorをスローする', async () => {
      await expect(repository.delete('NO-SUCH-EXCHANGE')).rejects.toThrow(
        expect.objectContaining({ name: 'EntityNotFoundError' })
      );
    });

    it('Market を指定せずに作成すると未設定のまま取得できる', async () => {
      const created = await repository.create(buildExchangeInput());

      expect(created.market).toBeUndefined();

      const fetched = await repository.getById(created.exchangeId);
      expect(fetched?.market).toBeUndefined();
    });

    it('Market を指定して作成・取得できる', async () => {
      const created = await repository.create(buildExchangeInput({ market: 'JP' }));

      expect(created.market).toBe('JP');

      const fetched = await repository.getById(created.exchangeId);
      expect(fetched?.market).toBe('JP');
    });

    it('未設定のMarketをupdateで設定できる', async () => {
      const created = await repository.create(buildExchangeInput());

      const updated = await repository.update(created.exchangeId, { market: 'US' });

      expect(updated.market).toBe('US');
    });

    it('Marketをnullでupdateすると未設定に戻る（DynamoDBの属性削除相当）', async () => {
      const created = await repository.create(buildExchangeInput({ market: 'JP' }));

      const updated = await repository.update(created.exchangeId, { market: null });

      expect(updated.market).toBeUndefined();

      const fetched = await repository.getById(created.exchangeId);
      expect(fetched?.market).toBeUndefined();
    });

    it('Marketを指定しないupdateでは既存の値が保持される', async () => {
      const created = await repository.create(buildExchangeInput({ market: 'JP' }));

      const updated = await repository.update(created.exchangeId, { name: 'NASDAQ改称' });

      expect(updated.market).toBe('JP');
    });
  });
}
