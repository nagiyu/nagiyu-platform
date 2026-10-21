/**
 * ForecastRepository 契約テスト（実装非依存の振る舞い仕様）
 *
 * InMemory実装と実DynamoDB実装（DynamoDB Local）の双方に同一の仕様を通し、実装間の乖離
 * （条件付き書き込みの意味論・GSI4 射影・ページングなど）を機械的に検知する。
 * 「一度書いたら書き換えない」（条件付き作成・Outcome の一度きりの追記）を中心に検証する。
 */
import type { ForecastRepository } from '../../src/repositories/forecast.repository.interface.js';
import type { CreateForecastInput } from '../../src/entities/forecast.entity.js';
import type { TickerOutcome } from '../../src/forecast/index.js';

/** 契約テストの対象実装が満たすべきフック */
export interface ForecastRepositoryContractHooks {
  makeRepository: () => Promise<ForecastRepository>;
  reset: () => Promise<void>;
  teardown?: () => Promise<void>;
  /** 保存形式を直接指定して Item を書き込む (旧形式や壊れたデータを再現するために使う) */
  putRawItem: (item: Record<string, unknown>) => Promise<void>;
  /** 保存されている Item を保存形式のまま読む */
  getRawItem: (pk: string, sk: string) => Promise<Record<string, unknown> | undefined>;
}

function buildForecastInput(overrides: Partial<CreateForecastInput> = {}): CreateForecastInput {
  return {
    tickerId: 'NSDQ:AAPL',
    exchangeId: 'NASDAQ',
    market: 'US',
    date: '2026-02-27',
    axisValues: { 'buy-count-ge2': true, 'range-today': 0.12 },
    normal: { range: 0.03, volume: 1_000_000 },
    probabilities: {
      DIR: {
        probability: 0.52,
        baseline: 0.5,
        neutralBand: { lower: -0.05, upper: 0.05 },
        bandHistory: null,
        lean: 'NEUTRAL',
        contributions: { 'buy-count-ge2': 0.01 },
        lowSampleAxes: [],
      },
    },
    modelVersion: 'forecast-core-v1',
    source: 'LIVE',
    ...overrides,
  };
}

function buildOutcome(overrides: Partial<TickerOutcome> = {}): TickerOutcome {
  return {
    tickerId: 'NSDQ:AAPL',
    exchangeId: 'NASDAQ',
    market: 'US',
    date: '2026-02-27',
    nextDate: '2026-02-28',
    nextReturn: 0.01,
    excessReturn: 0.005,
    nextRange: 0.02,
    rangeRatio: 1.1,
    hit: { DIR: true, VOL: false },
    evaluatedAt: 1_700_100_000_000,
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

export function defineForecastRepositoryContract(
  label: string,
  hooks: ForecastRepositoryContractHooks
): void {
  describe(`ForecastRepository 契約: ${label}`, () => {
    let repository: ForecastRepository;

    beforeEach(async () => {
      await hooks.reset();
      repository = await hooks.makeRepository();
    });

    afterAll(async () => {
      if (hooks.teardown) {
        await hooks.teardown();
      }
    });

    it('getByTickerAndDate は未登録の Forecast に対して null を返す', async () => {
      expect(await repository.getByTickerAndDate('NO-SUCH', '2026-02-27')).toBeNull();
    });

    it('createIfAbsent は新規作成し、getByTickerAndDate で取得できる', async () => {
      const input = buildForecastInput();
      const result = await repository.createIfAbsent(input);

      expect(result.created).toBe(true);
      expect(result.item).toMatchObject(input);
      expect(result.item.createdAt).toBeGreaterThan(0);

      const fetched = await repository.getByTickerAndDate(input.tickerId, input.date);
      expect(fetched).toEqual(result.item);
    });

    it('createIfAbsent は既に存在する場合、書き込まず既存の値を created:false で返す（冪等な再実行）', async () => {
      const first = await repository.createIfAbsent(buildForecastInput());
      const second = await repository.createIfAbsent(
        buildForecastInput({ axisValues: { changed: true } })
      );

      expect(second.created).toBe(false);
      expect(second.item).toEqual(first.item);

      const fetched = await repository.getByTickerAndDate('NSDQ:AAPL', '2026-02-27');
      // 予測部分は最初に書いた値のまま（一度書いたら書き換えない）
      expect(fetched?.axisValues).toEqual(buildForecastInput().axisValues);
    });

    it('appendOutcome は既存 Forecast に Outcome を追記し、予測部分は変更しない', async () => {
      const created = await repository.createIfAbsent(buildForecastInput());
      const result = await repository.appendOutcome(
        { tickerId: 'NSDQ:AAPL', date: '2026-02-27' },
        buildOutcome()
      );

      expect(result.updated).toBe(true);
      expect(result.item.outcome).toEqual({
        nextDate: '2026-02-28',
        nextReturn: 0.01,
        excessReturn: 0.005,
        nextRange: 0.02,
        rangeRatio: 1.1,
        hit: { DIR: true, VOL: false },
        evaluatedAt: 1_700_100_000_000,
      });
      // 予測部分 (axisValues・normal・probabilities) は一切変わらない
      expect(result.item.axisValues).toEqual(created.item.axisValues);
      expect(result.item.normal).toEqual(created.item.normal);
      expect(result.item.probabilities).toEqual(created.item.probabilities);
    });

    it('appendOutcome は既に Outcome がある場合、上書きせず updated:false で既存を返す（冪等な再実行）', async () => {
      await repository.createIfAbsent(buildForecastInput());
      const first = await repository.appendOutcome(
        { tickerId: 'NSDQ:AAPL', date: '2026-02-27' },
        buildOutcome()
      );
      const second = await repository.appendOutcome(
        { tickerId: 'NSDQ:AAPL', date: '2026-02-27' },
        buildOutcome({ hit: { DIR: false, VOL: true } })
      );

      expect(second.updated).toBe(false);
      expect(second.item.outcome).toEqual(first.item.outcome);
    });

    it('appendOutcome は対象 Forecast が存在しない場合 EntityNotFoundError をスローする', async () => {
      await expect(
        repository.appendOutcome({ tickerId: 'NO-SUCH', date: '2026-02-27' }, buildOutcome())
      ).rejects.toThrow(expect.objectContaining({ name: 'EntityNotFoundError' }));
    });

    it('getByExchangeAndDate は同一取引所・同一日の Forecast を TickerID 昇順で返す（パーティション分離を含む）', async () => {
      await repository.createIfAbsent(buildForecastInput({ tickerId: 'C' }));
      await repository.createIfAbsent(buildForecastInput({ tickerId: 'B' }));
      // 他日（対象外）
      await repository.createIfAbsent(buildForecastInput({ tickerId: 'A', date: '2026-02-26' }));
      // 他取引所（対象外）
      await repository.createIfAbsent(buildForecastInput({ tickerId: 'D', exchangeId: 'NYSE' }));

      const result = await repository.getByExchangeAndDate('NASDAQ', '2026-02-27');

      expect(result.map((item) => item.tickerId)).toEqual(['B', 'C']);
      expect(
        result.every((item) => item.exchangeId === 'NASDAQ' && item.date === '2026-02-27')
      ).toBe(true);
    });

    it('getSamplesByExchangesAndDateRange は境界日（fromDate/toDateちょうど）を含み、複数取引所をまとめて返す', async () => {
      await repository.createIfAbsent(buildForecastInput({ tickerId: 'T1', date: '2026-02-01' }));
      await repository.createIfAbsent(buildForecastInput({ tickerId: 'T2', date: '2026-02-27' }));
      // 範囲外（対象外）
      await repository.createIfAbsent(buildForecastInput({ tickerId: 'T3', date: '2026-03-01' }));
      // 別取引所（同じ市場。対象）
      await repository.createIfAbsent(
        buildForecastInput({ tickerId: 'T4', exchangeId: 'NYSE', date: '2026-02-15' })
      );

      const result = await repository.getSamplesByExchangesAndDateRange(
        ['NASDAQ', 'NYSE'],
        '2026-02-01',
        '2026-02-27'
      );

      expect(result.map((s) => s.tickerId).sort()).toEqual(['T1', 'T2', 'T4']);
    });

    it('getSamplesByExchangesAndDateRange は fromDate・toDate 省略時に全期間を返す', async () => {
      await repository.createIfAbsent(buildForecastInput({ tickerId: 'T1', date: '2026-01-01' }));
      await repository.createIfAbsent(buildForecastInput({ tickerId: 'T2', date: '2026-12-31' }));

      const result = await repository.getSamplesByExchangesAndDateRange(['NASDAQ']);
      expect(result.map((s) => s.tickerId).sort()).toEqual(['T1', 'T2']);
    });

    it('getSamplesByExchangesAndDateRange は toDate だけ指定すると、その日以前を返す', async () => {
      await repository.createIfAbsent(buildForecastInput({ tickerId: 'T1', date: '2026-01-01' }));
      await repository.createIfAbsent(buildForecastInput({ tickerId: 'T2', date: '2026-02-27' }));
      await repository.createIfAbsent(buildForecastInput({ tickerId: 'T3', date: '2026-03-01' }));

      const result = await repository.getSamplesByExchangesAndDateRange(
        ['NASDAQ'],
        undefined,
        '2026-02-27'
      );
      expect(result.map((s) => s.tickerId).sort()).toEqual(['T1', 'T2']);
    });

    it('getSamplesByExchangesAndDateRange は採点済みサンプルの outcome・probabilities を含む', async () => {
      await repository.createIfAbsent(buildForecastInput());
      await repository.appendOutcome({ tickerId: 'NSDQ:AAPL', date: '2026-02-27' }, buildOutcome());

      const result = await repository.getSamplesByExchangesAndDateRange(['NASDAQ']);
      expect(result).toHaveLength(1);
      expect(result[0].outcome).toEqual({
        nextDate: '2026-02-28',
        hit: { DIR: true, VOL: false },
        excessReturn: 0.005,
      });
      expect(result[0].probabilities).toEqual({ DIR: { probability: 0.52, baseline: 0.5 } });
    });

    it('getSamplesByExchangesAndDateRange は100件超でもページ境界をまたいで全件を取りこぼさない', async () => {
      const total = 130;
      const baseDate = '2026-01-01';
      for (let i = 0; i < total; i += 1) {
        await repository.createIfAbsent(
          buildForecastInput({
            tickerId: `T${String(i).padStart(4, '0')}`,
            date: addDays(baseDate, i),
          })
        );
      }

      const result = await repository.getSamplesByExchangesAndDateRange(['NASDAQ']);
      expect(result).toHaveLength(total);
      expect(new Set(result.map((s) => s.tickerId)).size).toBe(total);
    });

    it('保存形式（PascalCase の属性名・キー・GSI4・数値ミリ秒の時刻）で書き込む', async () => {
      const created = await repository.createIfAbsent(buildForecastInput());

      expect(await hooks.getRawItem('FORECAST#NSDQ:AAPL', 'DATE#2026-02-27')).toEqual({
        PK: 'FORECAST#NSDQ:AAPL',
        SK: 'DATE#2026-02-27',
        Type: 'Forecast',
        GSI4PK: 'FORECAST#NASDAQ',
        GSI4SK: 'DATE#2026-02-27#NSDQ:AAPL',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Market: 'US',
        Date: '2026-02-27',
        AxisValues: created.item.axisValues,
        Normal: created.item.normal,
        Probabilities: created.item.probabilities,
        ModelVersion: 'forecast-core-v1',
        Source: 'LIVE',
        CreatedAt: created.item.createdAt,
        UpdatedAt: created.item.updatedAt,
      });
    });

    it('appendOutcome は Outcome を保存形式で書き、更新日時を進める', async () => {
      const created = await repository.createIfAbsent(buildForecastInput());
      // 同じミリ秒内に収まらないよう、更新日時が進む時間だけ待つ
      await new Promise((resolve) => setTimeout(resolve, 5));

      const result = await repository.appendOutcome(
        { tickerId: 'NSDQ:AAPL', date: '2026-02-27' },
        buildOutcome()
      );

      expect(result.item.updatedAt).toBeGreaterThan(created.item.updatedAt);
      expect(result.item.createdAt).toBe(created.item.createdAt);
      const raw = await hooks.getRawItem('FORECAST#NSDQ:AAPL', 'DATE#2026-02-27');
      expect(raw?.Outcome).toEqual(result.item.outcome);
      expect(raw?.UpdatedAt).toBe(result.item.updatedAt);
      expect(raw?.GSI4SK).toBe('DATE#2026-02-27#NSDQ:AAPL');
    });

    it('appendOutcome のあとも、getByExchangeAndDate で取得できる', async () => {
      await repository.createIfAbsent(buildForecastInput());
      await repository.appendOutcome({ tickerId: 'NSDQ:AAPL', date: '2026-02-27' }, buildOutcome());

      const result = await repository.getByExchangeAndDate('NASDAQ', '2026-02-27');

      expect(result.map((item) => item.tickerId)).toEqual(['NSDQ:AAPL']);
      expect(result[0].outcome?.hit).toEqual({ DIR: true, VOL: false });
    });

    describe('旧形式のデータ', () => {
      const LEGACY_TIME = '2026-02-27T10:00:00.000Z';

      function legacyItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
        return {
          PK: 'FORECAST#NSDQ:AAPL',
          SK: 'DATE#2026-02-27',
          Type: 'Forecast',
          GSI4PK: 'FORECAST#NASDAQ',
          GSI4SK: 'DATE#2026-02-27#NSDQ:AAPL',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          Market: 'US',
          Date: '2026-02-27',
          AxisValues: { 'buy-count-ge2': true },
          Normal: { range: 0.03 },
          Probabilities: {},
          ModelVersion: 'forecast-core-v1',
          Source: 'LIVE',
          CreatedAt: LEGACY_TIME,
          UpdatedAt: LEGACY_TIME,
          ...overrides,
        };
      }

      it('時刻が ISO 文字列の Forecast も、ミリ秒で読める', async () => {
        await hooks.putRawItem(legacyItem());

        const fetched = await repository.getByTickerAndDate('NSDQ:AAPL', '2026-02-27');

        expect(fetched?.createdAt).toBe(Date.parse(LEGACY_TIME));
        expect(fetched?.updatedAt).toBe(Date.parse(LEGACY_TIME));
      });

      it('createIfAbsent は旧形式の既存を書き換えず、created:false で返す', async () => {
        await hooks.putRawItem(legacyItem());

        const result = await repository.createIfAbsent(buildForecastInput());

        expect(result.created).toBe(false);
        expect(result.item.createdAt).toBe(Date.parse(LEGACY_TIME));
        const raw = await hooks.getRawItem('FORECAST#NSDQ:AAPL', 'DATE#2026-02-27');
        expect(raw?.CreatedAt).toBe(LEGACY_TIME);
      });

      it('appendOutcome は旧形式の Forecast にも追記でき、更新日時だけが数値ミリ秒になる', async () => {
        await hooks.putRawItem(legacyItem());

        const result = await repository.appendOutcome(
          { tickerId: 'NSDQ:AAPL', date: '2026-02-27' },
          buildOutcome()
        );

        expect(result.updated).toBe(true);
        expect(result.item.createdAt).toBe(Date.parse(LEGACY_TIME));
        const raw = await hooks.getRawItem('FORECAST#NSDQ:AAPL', 'DATE#2026-02-27');
        expect(raw?.CreatedAt).toBe(LEGACY_TIME);
        expect(typeof raw?.UpdatedAt).toBe('number');
      });
    });

    describe('読めない Forecast', () => {
      async function putBrokenItem(): Promise<void> {
        await hooks.putRawItem({
          PK: 'FORECAST#NSDQ:AAPL',
          SK: 'DATE#2026-02-27',
          Type: 'Forecast',
          GSI4PK: 'FORECAST#NASDAQ',
          GSI4SK: 'DATE#2026-02-27#NSDQ:AAPL',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          Market: 'US',
          Date: '2026-02-27',
          AxisValues: 'broken',
          Normal: {},
          Probabilities: {},
          ModelVersion: 'forecast-core-v1',
          Source: 'LIVE',
          CreatedAt: 1_700_000_000_000,
          UpdatedAt: 1_700_000_000_000,
        });
      }

      it.each([
        [
          'getByTickerAndDate',
          (repo: ForecastRepository) => repo.getByTickerAndDate('NSDQ:AAPL', '2026-02-27'),
        ],
        [
          'getByExchangeAndDate',
          (repo: ForecastRepository) => repo.getByExchangeAndDate('NASDAQ', '2026-02-27'),
        ],
        [
          'getSamplesByExchangesAndDateRange',
          (repo: ForecastRepository) => repo.getSamplesByExchangesAndDateRange(['NASDAQ']),
        ],
        [
          'createIfAbsent（既存が読めない）',
          (repo: ForecastRepository) => repo.createIfAbsent(buildForecastInput()),
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
          repository.appendOutcome({ tickerId: 'NSDQ:AAPL', date: '2026-02-27' }, buildOutcome())
        ).rejects.toThrow(expect.objectContaining({ name: 'InvalidEntityDataError' }));

        const raw = await hooks.getRawItem('FORECAST#NSDQ:AAPL', 'DATE#2026-02-27');
        expect(raw?.Outcome).toBeDefined();
      });
    });
  });
}
