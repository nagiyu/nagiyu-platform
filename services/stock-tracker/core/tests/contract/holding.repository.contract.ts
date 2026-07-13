/**
 * HoldingRepository 契約テスト（実装非依存の振る舞い仕様）
 *
 * InMemory実装と実DynamoDB実装（DynamoDB Local）の双方に同一の仕様を通し、
 * 実装間の乖離（GSI射影・ソート順・条件式の挙動など）を機械的に検知する。
 * 1テスト1結末の原則を守り、実行時分岐で結末を変える形骸化テストは書かない。
 */

import type { HoldingRepository } from '../../src/repositories/holding.repository.interface.js';
import type { CreateHoldingInput } from '../../src/entities/holding.entity.js';

/**
 * 契約テストの対象実装が満たすべきフック
 */
export interface HoldingRepositoryContractHooks {
  /** テスト対象のリポジトリを生成する（reset の後に呼ばれる） */
  makeRepository: () => Promise<HoldingRepository>;
  /** 各テスト前にストア／テーブルをクリーンな状態に戻す */
  reset: () => Promise<void>;
  /** 全テスト終了後の後始末（テーブル削除等） */
  teardown?: () => Promise<void>;
}

function buildHoldingInput(overrides: Partial<CreateHoldingInput> = {}): CreateHoldingInput {
  return {
    UserID: 'user-001',
    TickerID: 'NSDQ:AAPL',
    ExchangeID: 'NASDAQ',
    Quantity: 100,
    AveragePrice: 150,
    Currency: 'USD',
    ...overrides,
  };
}

/**
 * HoldingRepository の契約テストスイートを定義する。
 *
 * @param label - テスト対象実装のラベル（describe名に使用）
 * @param hooks - テスト対象実装を操作するためのフック
 */
export function defineHoldingRepositoryContract(
  label: string,
  hooks: HoldingRepositoryContractHooks
): void {
  describe(`HoldingRepository 契約: ${label}`, () => {
    let repository: HoldingRepository;

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
      const input = buildHoldingInput();

      const created = await repository.create(input);
      expect(created).toMatchObject(input);

      const fetched = await repository.getById(input.UserID, input.TickerID);
      expect(fetched).toEqual(created);

      const updated = await repository.update(input.UserID, input.TickerID, { Quantity: 200 });
      expect(updated.Quantity).toBe(200);

      await repository.delete(input.UserID, input.TickerID);
      const afterDelete = await repository.getById(input.UserID, input.TickerID);
      expect(afterDelete).toBeNull();
    });

    it('getByUserId は指定ユーザーのholdingだけを返す（GSIパーティション分離）', async () => {
      await repository.create(buildHoldingInput({ UserID: 'user-A', TickerID: 'NSDQ:AAPL' }));
      await repository.create(buildHoldingInput({ UserID: 'user-A', TickerID: 'NSDQ:NVDA' }));
      await repository.create(buildHoldingInput({ UserID: 'user-B', TickerID: 'NSDQ:TSLA' }));

      const result = await repository.getByUserId('user-A');

      expect(result.items).toHaveLength(2);
      expect(result.items.every((item) => item.UserID === 'user-A')).toBe(true);
    });

    it('getByUserId は挿入順ではなくソートキー（Holding#TickerID）の昇順で返す', async () => {
      // 意図的に非ソート順（TSLA→AAPL→NVDA）で作成する
      await repository.create(buildHoldingInput({ UserID: 'user-sort', TickerID: 'TSLA' }));
      await repository.create(buildHoldingInput({ UserID: 'user-sort', TickerID: 'AAPL' }));
      await repository.create(buildHoldingInput({ UserID: 'user-sort', TickerID: 'NVDA' }));

      const result = await repository.getByUserId('user-sort');

      expect(result.items.map((item) => item.TickerID)).toEqual(['AAPL', 'NVDA', 'TSLA']);
    });

    it('getByUserId はlimit+cursorのページネーションで重複・欠落なく全件をソートキー昇順に走査できる', async () => {
      const tickerIds = ['E', 'C', 'A', 'D', 'B'];
      for (const tickerId of tickerIds) {
        await repository.create(buildHoldingInput({ UserID: 'user-page', TickerID: tickerId }));
      }

      const collected: string[] = [];
      let cursor: string | undefined;

      do {
        const page = await repository.getByUserId('user-page', { limit: 2, cursor });
        collected.push(...page.items.map((item) => item.TickerID));
        cursor = page.nextCursor;
      } while (cursor);

      expect(collected).toEqual(['A', 'B', 'C', 'D', 'E']);
    });

    it('同じUserID/TickerIDでcreateを重複させるとEntityAlreadyExistsErrorをスローする', async () => {
      const input = buildHoldingInput();
      await repository.create(input);

      await expect(repository.create(input)).rejects.toThrow(
        expect.objectContaining({ name: 'EntityAlreadyExistsError' })
      );
    });

    it('存在しない対象へのupdateはEntityNotFoundErrorをスローする', async () => {
      await expect(
        repository.update('no-such-user', 'no-such-ticker', { Quantity: 1 })
      ).rejects.toThrow(expect.objectContaining({ name: 'EntityNotFoundError' }));
    });

    it('存在しない対象へのdeleteはEntityNotFoundErrorをスローする', async () => {
      await expect(repository.delete('no-such-user', 'no-such-ticker')).rejects.toThrow(
        expect.objectContaining({ name: 'EntityNotFoundError' })
      );
    });
  });
}
