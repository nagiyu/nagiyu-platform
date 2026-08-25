/**
 * DailySummaryRepository 契約テスト（実装非依存の振る舞い仕様）
 *
 * InMemory実装と実DynamoDB実装（DynamoDB Local）の双方に同一の仕様を通し、
 * 実装間の乖離（GSI4射影・ソート順・between条件式の境界挙動など）を機械的に検知する。
 * 各テストは決定的で単一の結末を持ち（実行時分岐で結末を変えない・自己スキップしない）、
 * 形骸化テストは書かない。
 *
 * getByExchange / getByExchangeAndDateRange は GSI4（ExchangeSummaryIndex）に対する
 * 正攻法のQuery（begins_with / between）のため、順序（GSI4SK=DATE#{Date}#{TickerID}昇順）を
 * assert する。
 */

import type { DailySummaryRepository } from '../../src/repositories/daily-summary.repository.interface.js';
import type { CreateDailySummaryInput } from '../../src/entities/daily-summary.entity.js';

/**
 * 契約テストの対象実装が満たすべきフック
 */
export interface DailySummaryRepositoryContractHooks {
  /** テスト対象のリポジトリを生成する（reset の後に呼ばれる） */
  makeRepository: () => Promise<DailySummaryRepository>;
  /** 各テスト前にストア／テーブルをクリーンな状態に戻す */
  reset: () => Promise<void>;
  /** 全テスト終了後の後始末（テーブル削除等） */
  teardown?: () => Promise<void>;
}

function buildDailySummaryInput(
  overrides: Partial<CreateDailySummaryInput> = {}
): CreateDailySummaryInput {
  return {
    TickerID: 'NSDQ:AAPL',
    ExchangeID: 'NASDAQ',
    Date: '2024-01-02',
    Open: 100,
    High: 110,
    Low: 95,
    Close: 105,
    ...overrides,
  };
}

/** `baseDate`（YYYY-MM-DD）から`days`日後の日付をYYYY-MM-DD形式で返す（UTC基準） */
function addDays(baseDate: string, days: number): string {
  const [year, month, day] = baseDate.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * 24 * 60 * 60 * 1000);
  const yyyy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * DailySummaryRepository の契約テストスイートを定義する。
 *
 * @param label - テスト対象実装のラベル（describe名に使用）
 * @param hooks - テスト対象実装を操作するためのフック
 */
export function defineDailySummaryRepositoryContract(
  label: string,
  hooks: DailySummaryRepositoryContractHooks
): void {
  describe(`DailySummaryRepository 契約: ${label}`, () => {
    let repository: DailySummaryRepository;

    beforeEach(async () => {
      await hooks.reset();
      repository = await hooks.makeRepository();
    });

    afterAll(async () => {
      if (hooks.teardown) {
        await hooks.teardown();
      }
    });

    it('getByTickerAndDate は未登録のサマリーに対してnullを返す', async () => {
      expect(await repository.getByTickerAndDate('NO-SUCH-TICKER', '2024-01-01')).toBeNull();
    });

    it('upsertは新規作成し、getByTickerAndDateで取得できる', async () => {
      const input = buildDailySummaryInput();

      const created = await repository.upsert(input);
      expect(created).toMatchObject(input);
      expect(created.CreatedAt).toBeGreaterThan(0);
      expect(created.UpdatedAt).toBeGreaterThan(0);

      const fetched = await repository.getByTickerAndDate(input.TickerID, input.Date);
      expect(fetched).toEqual(created);
    });

    it('upsertは既存のサマリーを上書きし、CreatedAtは維持したままフィールドが更新される', async () => {
      const created = await repository.upsert(buildDailySummaryInput({ Close: 105 }));

      const overwritten = await repository.upsert(
        buildDailySummaryInput({ Close: 120, High: 125 })
      );

      expect(overwritten.Close).toBe(120);
      expect(overwritten.High).toBe(125);
      expect(overwritten.CreatedAt).toBe(created.CreatedAt);

      const fetched = await repository.getByTickerAndDate(created.TickerID, created.Date);
      expect(fetched?.Close).toBe(120);
      expect(fetched?.CreatedAt).toBe(created.CreatedAt);
    });

    it('markAsEvaluatedは採点結果フィールドを一括反映する', async () => {
      const created = await repository.upsert(buildDailySummaryInput());

      await repository.markAsEvaluated(
        { tickerId: created.TickerID, date: created.Date },
        {
          EvaluationDate: '2024-01-03',
          EvaluationClose: 108,
          ActualReturn: 2.5,
          Hit: true,
          EvaluationThresholdPercent: 0.5,
          EvaluatedAt: 1_700_000_000_000,
        }
      );

      const fetched = await repository.getByTickerAndDate(created.TickerID, created.Date);
      expect(fetched).toMatchObject({
        EvaluationDate: '2024-01-03',
        EvaluationClose: 108,
        ActualReturn: 2.5,
        Hit: true,
        EvaluationThresholdPercent: 0.5,
        EvaluatedAt: 1_700_000_000_000,
      });
    });

    it('存在しない対象へのmarkAsEvaluatedはEntityNotFoundErrorをスローする', async () => {
      await expect(
        repository.markAsEvaluated(
          { tickerId: 'NO-SUCH-TICKER', date: '2024-01-01' },
          {
            EvaluationDate: '2024-01-02',
            EvaluationClose: 100,
            ActualReturn: 0,
            Hit: false,
            EvaluationThresholdPercent: 0.5,
            EvaluatedAt: 1_700_000_000_000,
          }
        )
      ).rejects.toThrow(expect.objectContaining({ name: 'EntityNotFoundError' }));
    });

    it('採点済みの対象への再度のmarkAsEvaluatedはEntityAlreadyExistsErrorをスローする', async () => {
      const created = await repository.upsert(buildDailySummaryInput());
      const evaluationFields = {
        EvaluationDate: '2024-01-03',
        EvaluationClose: 108,
        ActualReturn: 2.5,
        Hit: true,
        EvaluationThresholdPercent: 0.5,
        EvaluatedAt: 1_700_000_000_000,
      };
      await repository.markAsEvaluated(
        { tickerId: created.TickerID, date: created.Date },
        evaluationFields
      );

      await expect(
        repository.markAsEvaluated(
          { tickerId: created.TickerID, date: created.Date },
          evaluationFields
        )
      ).rejects.toThrow(expect.objectContaining({ name: 'EntityAlreadyExistsError' }));
    });

    it('getByExchangeはdate指定時、begins_withで対象取引所・対象日のサマリーだけをGSI4SK昇順で返す', async () => {
      // 意図的に非ソート順（C→Bの順）で作成し、他日・他取引所のノイズも混ぜる
      await repository.upsert(
        buildDailySummaryInput({ TickerID: 'C', ExchangeID: 'EX-A', Date: '2024-01-02' })
      );
      await repository.upsert(
        buildDailySummaryInput({ TickerID: 'B', ExchangeID: 'EX-A', Date: '2024-01-02' })
      );
      // 他日（対象外）
      await repository.upsert(
        buildDailySummaryInput({ TickerID: 'A', ExchangeID: 'EX-A', Date: '2024-01-01' })
      );
      // 他取引所（対象外、パーティション分離の確認）
      await repository.upsert(
        buildDailySummaryInput({ TickerID: 'D', ExchangeID: 'EX-B', Date: '2024-01-02' })
      );

      const result = await repository.getByExchange('EX-A', '2024-01-02');

      expect(result.map((item) => item.TickerID)).toEqual(['B', 'C']);
      expect(result.every((item) => item.ExchangeID === 'EX-A' && item.Date === '2024-01-02')).toBe(
        true
      );
    });

    it('getByExchangeはdate省略時、取引所内で最も新しい日付の全サマリーのみをGSI4SK昇順で返す', async () => {
      // 意図的に非時系列順で作成する
      await repository.upsert(
        buildDailySummaryInput({ TickerID: 'B', ExchangeID: 'EX-A', Date: '2024-01-03' })
      );
      await repository.upsert(
        buildDailySummaryInput({ TickerID: 'A', ExchangeID: 'EX-A', Date: '2024-01-01' })
      );
      await repository.upsert(
        buildDailySummaryInput({ TickerID: 'A', ExchangeID: 'EX-A', Date: '2024-01-03' })
      );
      await repository.upsert(
        buildDailySummaryInput({ TickerID: 'B', ExchangeID: 'EX-A', Date: '2024-01-02' })
      );

      const result = await repository.getByExchange('EX-A');

      expect(result.map((item) => `${item.TickerID}#${item.Date}`)).toEqual([
        'A#2024-01-03',
        'B#2024-01-03',
      ]);
    });

    it('getByExchangeAndDateRangeは境界日（fromDate/toDateちょうど）を含み、範囲外の日付を除く', async () => {
      await repository.upsert(
        buildDailySummaryInput({ TickerID: 'T1', ExchangeID: 'EX-A', Date: '2024-01-01' })
      );
      await repository.upsert(
        buildDailySummaryInput({ TickerID: 'T2', ExchangeID: 'EX-A', Date: '2024-01-02' })
      );
      await repository.upsert(
        buildDailySummaryInput({ TickerID: 'T3', ExchangeID: 'EX-A', Date: '2024-01-03' })
      );
      await repository.upsert(
        buildDailySummaryInput({ TickerID: 'T4', ExchangeID: 'EX-A', Date: '2024-01-05' })
      );
      await repository.upsert(
        buildDailySummaryInput({ TickerID: 'T5', ExchangeID: 'EX-A', Date: '2024-01-06' })
      );

      const result = await repository.getByExchangeAndDateRange('EX-A', '2024-01-02', '2024-01-05');

      expect(result.map((item) => item.Date)).toEqual(['2024-01-02', '2024-01-03', '2024-01-05']);
      expect(result.map((item) => item.TickerID)).toEqual(['T2', 'T3', 'T4']);
    });

    it('getByExchangeAndDateRangeは他取引所のサマリーを含まない（パーティション分離）', async () => {
      await repository.upsert(
        buildDailySummaryInput({ TickerID: 'T1', ExchangeID: 'EX-A', Date: '2024-01-02' })
      );
      await repository.upsert(
        buildDailySummaryInput({ TickerID: 'T2', ExchangeID: 'EX-B', Date: '2024-01-02' })
      );

      const result = await repository.getByExchangeAndDateRange('EX-A', '2024-01-01', '2024-01-03');

      expect(result).toHaveLength(1);
      expect(result[0].ExchangeID).toBe('EX-A');
    });

    it('getByExchangeはdate省略時、100件超のサマリーがあってもページ境界をまたいで正しい最新日を算出する（打ち切りの回帰防止）', async () => {
      // GSI4SK（DATE#{Date}#{TickerID}）昇順で先頭からstore既定limit（100件）だけを見ると
      // 最古側しか拾えず、最新日の算出が誤る。130件（>100）投入し、全件を集約したうえで
      // 最新日だけに絞り込めているかを検証する。
      const total = 130;
      const baseDate = '2024-01-01';
      for (let i = 0; i < total; i += 1) {
        await repository.upsert(
          buildDailySummaryInput({
            TickerID: `T${String(i).padStart(4, '0')}`,
            ExchangeID: 'EX-BULK',
            Date: addDays(baseDate, i),
          })
        );
      }

      const result = await repository.getByExchange('EX-BULK');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        TickerID: `T${String(total - 1).padStart(4, '0')}`,
        Date: addDays(baseDate, total - 1),
      });
    });

    it('getByExchangeAndDateRangeは100件超の範囲でもページ境界をまたいで全件を取りこぼさない（打ち切りの回帰防止）', async () => {
      // 150件投入し、その中間120件（先頭・末尾の一部は範囲外）をfrom/toで指定する。
      // store既定limit（100件）で打ち切られると120件に届かない・末尾（toDate側）が欠落する。
      const total = 150;
      const baseDate = '2024-01-01';
      for (let i = 0; i < total; i += 1) {
        await repository.upsert(
          buildDailySummaryInput({
            TickerID: `T${String(i).padStart(4, '0')}`,
            ExchangeID: 'EX-RANGE',
            Date: addDays(baseDate, i),
          })
        );
      }

      const fromDate = addDays(baseDate, 10);
      const toDate = addDays(baseDate, 129);

      const result = await repository.getByExchangeAndDateRange('EX-RANGE', fromDate, toDate);

      expect(result).toHaveLength(120);
      expect(result[0].Date).toBe(fromDate);
      expect(result[result.length - 1].Date).toBe(toDate);
      expect(new Set(result.map((item) => item.Date)).size).toBe(120);
    });
  });
}
