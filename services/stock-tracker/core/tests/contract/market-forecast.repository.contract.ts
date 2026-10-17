/**
 * MarketForecastRepository 契約テスト（実装非依存の振る舞い仕様）
 *
 * forecast.repository.contract.ts の市場版。InMemory実装と実DynamoDB実装（DynamoDB Local）の
 * 双方に同一の仕様を通し、実装間の乖離を機械的に検知する。
 */
import type { MarketForecastRepository } from '../../src/repositories/market-forecast.repository.interface.js';
import type { CreateMarketForecastInput } from '../../src/entities/market-forecast.entity.js';
import type { MarketOutcome } from '../../src/forecast/index.js';

export interface MarketForecastRepositoryContractHooks {
  makeRepository: () => Promise<MarketForecastRepository>;
  reset: () => Promise<void>;
  teardown?: () => Promise<void>;
  /** 保存形式を直接指定して Item を書き込む (旧形式や壊れたデータを再現するために使う) */
  putRawItem: (item: Record<string, unknown>) => Promise<void>;
  /** 保存されている Item を保存形式のまま読む */
  getRawItem: (pk: string, sk: string) => Promise<Record<string, unknown> | undefined>;
}

function buildMarketForecastInput(
  overrides: Partial<CreateMarketForecastInput> = {}
): CreateMarketForecastInput {
  return {
    market: 'US',
    date: '2026-02-27',
    axisValues: { 'market-range-avg': 0.1 },
    probabilities: {
      MKT: {
        probability: 0.45,
        baseline: 0.4,
        neutralBand: { lower: -0.1, upper: 0.1 },
        bandHistory: null,
        lean: 'NEUTRAL',
        contributions: {},
        lowSampleAxes: [],
      },
    },
    modelVersion: 'forecast-core-v1',
    source: 'LIVE',
    ...overrides,
  };
}

function buildOutcome(overrides: Partial<MarketOutcome> = {}): MarketOutcome {
  return {
    market: 'US',
    date: '2026-02-27',
    nextDate: '2026-02-28',
    nextRange: 0.09,
    rangeRatio: 1.05,
    hit: { MKT: true },
    evaluatedAt: 1_700_100_000_000,
    ...overrides,
  };
}

export function defineMarketForecastRepositoryContract(
  label: string,
  hooks: MarketForecastRepositoryContractHooks
): void {
  describe(`MarketForecastRepository 契約: ${label}`, () => {
    let repository: MarketForecastRepository;

    beforeEach(async () => {
      await hooks.reset();
      repository = await hooks.makeRepository();
    });

    afterAll(async () => {
      if (hooks.teardown) {
        await hooks.teardown();
      }
    });

    it('getByMarketAndDate は未登録の MarketForecast に対して null を返す', async () => {
      expect(await repository.getByMarketAndDate('US', '2026-02-27')).toBeNull();
    });

    it('createIfAbsent は新規作成し、getByMarketAndDate で取得できる', async () => {
      const input = buildMarketForecastInput();
      const result = await repository.createIfAbsent(input);

      expect(result.created).toBe(true);
      expect(result.item).toMatchObject(input);

      const fetched = await repository.getByMarketAndDate('US', '2026-02-27');
      expect(fetched).toEqual(result.item);
    });

    it('createIfAbsent は既に存在する場合、書き込まず既存の値を created:false で返す', async () => {
      const first = await repository.createIfAbsent(buildMarketForecastInput());
      const second = await repository.createIfAbsent(
        buildMarketForecastInput({ axisValues: { changed: 999 } })
      );

      expect(second.created).toBe(false);
      expect(second.item).toEqual(first.item);
    });

    it('appendOutcome は既存 MarketForecast に Outcome を追記し、予測部分は変更しない', async () => {
      const created = await repository.createIfAbsent(buildMarketForecastInput());
      const result = await repository.appendOutcome(
        { market: 'US', date: '2026-02-27' },
        buildOutcome()
      );

      expect(result.updated).toBe(true);
      expect(result.item.outcome).toEqual({
        nextDate: '2026-02-28',
        nextRange: 0.09,
        rangeRatio: 1.05,
        hit: { MKT: true },
        evaluatedAt: 1_700_100_000_000,
      });
      expect(result.item.axisValues).toEqual(created.item.axisValues);
      expect(result.item.probabilities).toEqual(created.item.probabilities);
    });

    it('appendOutcome は既に Outcome がある場合、上書きせず updated:false で既存を返す', async () => {
      await repository.createIfAbsent(buildMarketForecastInput());
      const first = await repository.appendOutcome(
        { market: 'US', date: '2026-02-27' },
        buildOutcome()
      );
      const second = await repository.appendOutcome(
        { market: 'US', date: '2026-02-27' },
        buildOutcome({ hit: { MKT: false } })
      );

      expect(second.updated).toBe(false);
      expect(second.item.outcome).toEqual(first.item.outcome);
    });

    it('appendOutcome は対象が存在しない場合 EntityNotFoundError をスローする', async () => {
      await expect(
        repository.appendOutcome({ market: 'JP', date: '2026-02-27' }, buildOutcome())
      ).rejects.toThrow(expect.objectContaining({ name: 'EntityNotFoundError' }));
    });

    it('getSamplesByDateRange は境界日を含み、市場でパーティション分離される', async () => {
      await repository.createIfAbsent(buildMarketForecastInput({ date: '2026-02-01' }));
      await repository.createIfAbsent(buildMarketForecastInput({ date: '2026-02-27' }));
      await repository.createIfAbsent(buildMarketForecastInput({ date: '2026-03-01' }));
      await repository.createIfAbsent(
        buildMarketForecastInput({ market: 'JP', date: '2026-02-15' })
      );

      const result = await repository.getSamplesByDateRange('US', '2026-02-01', '2026-02-27');
      expect(result.map((s) => s.date)).toEqual(['2026-02-01', '2026-02-27']);
      expect(result.every((s) => s.market === 'US')).toBe(true);
    });

    it('getSamplesByDateRange は fromDate・toDate 省略時に全期間を返す', async () => {
      await repository.createIfAbsent(buildMarketForecastInput({ date: '2026-01-01' }));
      await repository.createIfAbsent(buildMarketForecastInput({ date: '2026-12-31' }));

      const result = await repository.getSamplesByDateRange('US');
      expect(result.map((s) => s.date)).toEqual(['2026-01-01', '2026-12-31']);
    });

    it('getSamplesByDateRange は toDate だけ指定すると、その日以前を返す', async () => {
      await repository.createIfAbsent(buildMarketForecastInput({ date: '2026-01-01' }));
      await repository.createIfAbsent(buildMarketForecastInput({ date: '2026-02-27' }));
      await repository.createIfAbsent(buildMarketForecastInput({ date: '2026-03-01' }));

      const result = await repository.getSamplesByDateRange('US', undefined, '2026-02-27');
      expect(result.map((s) => s.date)).toEqual(['2026-01-01', '2026-02-27']);
    });

    it('getSamplesByDateRange は採点済みサンプルの outcome・probabilities を含む', async () => {
      await repository.createIfAbsent(buildMarketForecastInput());
      await repository.appendOutcome({ market: 'US', date: '2026-02-27' }, buildOutcome());

      const result = await repository.getSamplesByDateRange('US');
      expect(result).toHaveLength(1);
      expect(result[0].outcome).toEqual({ nextDate: '2026-02-28', hit: { MKT: true } });
      expect(result[0].probabilities).toEqual({ MKT: { probability: 0.45, baseline: 0.4 } });
    });

    it('保存形式（PascalCase の属性名・キー・数値ミリ秒の時刻）で書き込む', async () => {
      const created = await repository.createIfAbsent(buildMarketForecastInput());

      expect(await hooks.getRawItem('MARKETFORECAST#US', 'DATE#2026-02-27')).toEqual({
        PK: 'MARKETFORECAST#US',
        SK: 'DATE#2026-02-27',
        Type: 'MarketForecast',
        Market: 'US',
        Date: '2026-02-27',
        AxisValues: created.item.axisValues,
        Probabilities: created.item.probabilities,
        ModelVersion: 'forecast-core-v1',
        Source: 'LIVE',
        CreatedAt: created.item.createdAt,
        UpdatedAt: created.item.updatedAt,
      });
    });

    it('appendOutcome は Outcome を保存形式で書き、更新日時を進める', async () => {
      const created = await repository.createIfAbsent(buildMarketForecastInput());
      // 同じミリ秒内に収まらないよう、更新日時が進む時間だけ待つ
      await new Promise((resolve) => setTimeout(resolve, 5));

      const result = await repository.appendOutcome(
        { market: 'US', date: '2026-02-27' },
        buildOutcome()
      );

      expect(result.item.updatedAt).toBeGreaterThan(created.item.updatedAt);
      expect(result.item.createdAt).toBe(created.item.createdAt);
      const raw = await hooks.getRawItem('MARKETFORECAST#US', 'DATE#2026-02-27');
      expect(raw?.Outcome).toEqual(result.item.outcome);
      expect(raw?.UpdatedAt).toBe(result.item.updatedAt);
    });

    describe('旧形式のデータ', () => {
      const LEGACY_TIME = '2026-02-27T10:00:00.000Z';

      function legacyItem(): Record<string, unknown> {
        return {
          PK: 'MARKETFORECAST#US',
          SK: 'DATE#2026-02-27',
          Type: 'MarketForecast',
          Market: 'US',
          Date: '2026-02-27',
          AxisValues: { 'market-range-avg': 0.1 },
          Probabilities: {},
          ModelVersion: 'forecast-core-v1',
          Source: 'LIVE',
          CreatedAt: LEGACY_TIME,
          UpdatedAt: LEGACY_TIME,
        };
      }

      it('時刻が ISO 文字列の MarketForecast も、ミリ秒で読める', async () => {
        await hooks.putRawItem(legacyItem());

        const fetched = await repository.getByMarketAndDate('US', '2026-02-27');

        expect(fetched?.createdAt).toBe(Date.parse(LEGACY_TIME));
        expect(fetched?.updatedAt).toBe(Date.parse(LEGACY_TIME));
      });

      it('getSamplesByDateRange でも読める', async () => {
        await hooks.putRawItem(legacyItem());

        const result = await repository.getSamplesByDateRange('US');

        expect(result.map((s) => s.date)).toEqual(['2026-02-27']);
      });

      it('appendOutcome は旧形式の MarketForecast にも追記でき、更新日時だけが数値ミリ秒になる', async () => {
        await hooks.putRawItem(legacyItem());

        const result = await repository.appendOutcome(
          { market: 'US', date: '2026-02-27' },
          buildOutcome()
        );

        expect(result.updated).toBe(true);
        expect(result.item.createdAt).toBe(Date.parse(LEGACY_TIME));
        const raw = await hooks.getRawItem('MARKETFORECAST#US', 'DATE#2026-02-27');
        expect(raw?.CreatedAt).toBe(LEGACY_TIME);
        expect(typeof raw?.UpdatedAt).toBe('number');
      });
    });

    describe('読めない MarketForecast', () => {
      async function putBrokenItem(): Promise<void> {
        await hooks.putRawItem({
          PK: 'MARKETFORECAST#US',
          SK: 'DATE#2026-02-27',
          Type: 'MarketForecast',
          Market: 'US',
          Date: '2026-02-27',
          AxisValues: 'broken',
          Probabilities: {},
          ModelVersion: 'forecast-core-v1',
          Source: 'LIVE',
          CreatedAt: 1_700_000_000_000,
          UpdatedAt: 1_700_000_000_000,
        });
      }

      it.each([
        [
          'getByMarketAndDate',
          (repo: MarketForecastRepository) => repo.getByMarketAndDate('US', '2026-02-27'),
        ],
        [
          'getSamplesByDateRange',
          (repo: MarketForecastRepository) => repo.getSamplesByDateRange('US'),
        ],
        [
          'createIfAbsent（既存が読めない）',
          (repo: MarketForecastRepository) => repo.createIfAbsent(buildMarketForecastInput()),
        ],
      ])('%s は、読み飛ばさず InvalidEntityDataError をスローする', async (_label, query) => {
        await putBrokenItem();

        await expect(query(repository)).rejects.toThrow(
          expect.objectContaining({ name: 'InvalidEntityDataError' })
        );
      });

      it('appendOutcome は Outcome を書いたうえで、変換に失敗して InvalidEntityDataError をスローする', async () => {
        await putBrokenItem();

        await expect(
          repository.appendOutcome({ market: 'US', date: '2026-02-27' }, buildOutcome())
        ).rejects.toThrow(expect.objectContaining({ name: 'InvalidEntityDataError' }));

        const raw = await hooks.getRawItem('MARKETFORECAST#US', 'DATE#2026-02-27');
        expect(raw?.Outcome).toBeDefined();
      });
    });
  });
}
