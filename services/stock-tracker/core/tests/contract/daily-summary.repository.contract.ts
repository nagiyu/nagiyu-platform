/**
 * DailySummaryRepository 契約テスト（実装非依存の振る舞い仕様）
 *
 * InMemory実装と実DynamoDB実装（DynamoDB Local）の双方に同一の仕様を通し、
 * 実装間の乖離（GSI4射影・ソート順・between条件式の境界挙動など）を機械的に検知する。
 * 各テストは決定的で単一の結末を持ち（実行時分岐で結末を変えない・自己スキップしない）、
 * 形骸化テストは書かない。
 *
 * getByExchange / getByExchangeAndDateRange は GSI4（ExchangeSummaryIndex）に対する
 * 正攻法のQueryのため、順序（GSI4SK=DATE#{Date}#{TickerID}昇順）をassertする。
 * ただしQuery条件はケースにより異なる: getByExchangeはdate指定時はbegins_with、
 * getByExchangeAndDateRangeはbetweenを使うが、getByExchangeのdate省略時は
 * ソートキー条件を伴わないPKのみのQuery（GSI4パーティション全件）＋
 * クライアント側での最新日フィルタである（begins_with/betweenのいずれでもない）。
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
  /** 保存形式を直接指定して Item を書き込む (旧形式や壊れたデータを再現するために使う) */
  putRawItem: (item: Record<string, unknown>) => Promise<void>;
  /** 保存されている Item を保存形式のまま読む */
  getRawItem: (pk: string, sk: string) => Promise<Record<string, unknown> | undefined>;
}

function buildDailySummaryInput(
  overrides: Partial<CreateDailySummaryInput> = {}
): CreateDailySummaryInput {
  return {
    tickerId: 'NSDQ:AAPL',
    exchangeId: 'NASDAQ',
    date: '2024-01-02',
    open: 100,
    high: 110,
    low: 95,
    close: 105,
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
      expect(created.createdAt).toBeGreaterThan(0);
      expect(created.updatedAt).toBeGreaterThan(0);

      const fetched = await repository.getByTickerAndDate(input.tickerId, input.date);
      expect(fetched).toEqual(created);
    });

    it('upsertは既存のサマリーを上書きし、CreatedAtは維持したままフィールドが更新される', async () => {
      const created = await repository.upsert(buildDailySummaryInput({ close: 105 }));

      const overwritten = await repository.upsert(
        buildDailySummaryInput({ close: 120, high: 125 })
      );

      expect(overwritten.close).toBe(120);
      expect(overwritten.high).toBe(125);
      expect(overwritten.createdAt).toBe(created.createdAt);

      const fetched = await repository.getByTickerAndDate(created.tickerId, created.date);
      expect(fetched?.close).toBe(120);
      expect(fetched?.createdAt).toBe(created.createdAt);
    });

    it('getByExchangeはdate指定時、begins_withで対象取引所・対象日のサマリーだけをGSI4SK昇順で返す', async () => {
      // 意図的に非ソート順（C→Bの順）で作成し、他日・他取引所のノイズも混ぜる
      await repository.upsert(
        buildDailySummaryInput({ tickerId: 'C', exchangeId: 'EX-A', date: '2024-01-02' })
      );
      await repository.upsert(
        buildDailySummaryInput({ tickerId: 'B', exchangeId: 'EX-A', date: '2024-01-02' })
      );
      // 他日（対象外）
      await repository.upsert(
        buildDailySummaryInput({ tickerId: 'A', exchangeId: 'EX-A', date: '2024-01-01' })
      );
      // 他取引所（対象外、パーティション分離の確認）
      await repository.upsert(
        buildDailySummaryInput({ tickerId: 'D', exchangeId: 'EX-B', date: '2024-01-02' })
      );

      const result = await repository.getByExchange('EX-A', '2024-01-02');

      expect(result.map((item) => item.tickerId)).toEqual(['B', 'C']);
      expect(result.every((item) => item.exchangeId === 'EX-A' && item.date === '2024-01-02')).toBe(
        true
      );
    });

    it('getByExchangeはdate省略時、取引所内で最も新しい日付の全サマリーのみをGSI4SK昇順で返す', async () => {
      // 意図的に非時系列順で作成する
      await repository.upsert(
        buildDailySummaryInput({ tickerId: 'B', exchangeId: 'EX-A', date: '2024-01-03' })
      );
      await repository.upsert(
        buildDailySummaryInput({ tickerId: 'A', exchangeId: 'EX-A', date: '2024-01-01' })
      );
      await repository.upsert(
        buildDailySummaryInput({ tickerId: 'A', exchangeId: 'EX-A', date: '2024-01-03' })
      );
      await repository.upsert(
        buildDailySummaryInput({ tickerId: 'B', exchangeId: 'EX-A', date: '2024-01-02' })
      );

      const result = await repository.getByExchange('EX-A');

      expect(result.map((item) => `${item.tickerId}#${item.date}`)).toEqual([
        'A#2024-01-03',
        'B#2024-01-03',
      ]);
    });

    it('getByExchangeAndDateRangeは境界日（fromDate/toDateちょうど）を含み、範囲外の日付を除く', async () => {
      await repository.upsert(
        buildDailySummaryInput({ tickerId: 'T1', exchangeId: 'EX-A', date: '2024-01-01' })
      );
      await repository.upsert(
        buildDailySummaryInput({ tickerId: 'T2', exchangeId: 'EX-A', date: '2024-01-02' })
      );
      await repository.upsert(
        buildDailySummaryInput({ tickerId: 'T3', exchangeId: 'EX-A', date: '2024-01-03' })
      );
      await repository.upsert(
        buildDailySummaryInput({ tickerId: 'T4', exchangeId: 'EX-A', date: '2024-01-05' })
      );
      await repository.upsert(
        buildDailySummaryInput({ tickerId: 'T5', exchangeId: 'EX-A', date: '2024-01-06' })
      );

      const result = await repository.getByExchangeAndDateRange('EX-A', '2024-01-02', '2024-01-05');

      expect(result.map((item) => item.date)).toEqual(['2024-01-02', '2024-01-03', '2024-01-05']);
      expect(result.map((item) => item.tickerId)).toEqual(['T2', 'T3', 'T4']);
    });

    it('getForecastFieldsByExchangeAndDateRangeはOHLCV・パターン結果・CreatedAtを持ちUpdatedAtを持たない', async () => {
      await repository.upsert(
        buildDailySummaryInput({
          tickerId: 'T1',
          exchangeId: 'EX-A',
          date: '2024-01-02',
          volume: 12345,
          buyPatternCount: 2,
          sellPatternCount: 0,
        })
      );

      const result = await repository.getForecastFieldsByExchangeAndDateRange(
        'EX-A',
        '2024-01-01',
        '2024-01-03'
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        tickerId: 'T1',
        exchangeId: 'EX-A',
        date: '2024-01-02',
        open: 100,
        high: 110,
        low: 95,
        close: 105,
        volume: 12345,
        buyPatternCount: 2,
        sellPatternCount: 0,
      });
      expect(typeof result[0].createdAt).toBe('number');
      expect(result[0]).not.toHaveProperty('UpdatedAt');
    });

    it('getForecastFieldsByExchangeAndDateRangeは境界日を含み範囲外の日付を除く', async () => {
      await repository.upsert(
        buildDailySummaryInput({ tickerId: 'T1', exchangeId: 'EX-A', date: '2024-01-01' })
      );
      await repository.upsert(
        buildDailySummaryInput({ tickerId: 'T2', exchangeId: 'EX-A', date: '2024-01-02' })
      );
      await repository.upsert(
        buildDailySummaryInput({ tickerId: 'T3', exchangeId: 'EX-A', date: '2024-01-05' })
      );

      const result = await repository.getForecastFieldsByExchangeAndDateRange(
        'EX-A',
        '2024-01-02',
        '2024-01-04'
      );

      expect(result.map((item) => item.tickerId)).toEqual(['T2']);
    });

    it('getByExchangeAndDateRangeは他取引所のサマリーを含まない（パーティション分離）', async () => {
      await repository.upsert(
        buildDailySummaryInput({ tickerId: 'T1', exchangeId: 'EX-A', date: '2024-01-02' })
      );
      await repository.upsert(
        buildDailySummaryInput({ tickerId: 'T2', exchangeId: 'EX-B', date: '2024-01-02' })
      );

      const result = await repository.getByExchangeAndDateRange('EX-A', '2024-01-01', '2024-01-03');

      expect(result).toHaveLength(1);
      expect(result[0].exchangeId).toBe('EX-A');
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
            tickerId: `T${String(i).padStart(4, '0')}`,
            exchangeId: 'EX-BULK',
            date: addDays(baseDate, i),
          })
        );
      }

      const result = await repository.getByExchange('EX-BULK');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        tickerId: `T${String(total - 1).padStart(4, '0')}`,
        date: addDays(baseDate, total - 1),
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
            tickerId: `T${String(i).padStart(4, '0')}`,
            exchangeId: 'EX-RANGE',
            date: addDays(baseDate, i),
          })
        );
      }

      const fromDate = addDays(baseDate, 10);
      const toDate = addDays(baseDate, 129);

      const result = await repository.getByExchangeAndDateRange('EX-RANGE', fromDate, toDate);

      expect(result).toHaveLength(120);
      expect(result[0].date).toBe(fromDate);
      expect(result[result.length - 1].date).toBe(toDate);
      expect(new Set(result.map((item) => item.date)).size).toBe(120);
    });

    it('保存形式（PascalCase の属性名・キー・GSI4・数値ミリ秒の時刻）で書き込む', async () => {
      const created = await repository.upsert(
        buildDailySummaryInput({
          volume: 12345,
          patternResults: { 'morning-star': 'MATCHED' },
          buyPatternCount: 1,
          sellPatternCount: 0,
        })
      );

      expect(await hooks.getRawItem('SUMMARY#NSDQ:AAPL', 'DATE#2024-01-02')).toEqual({
        PK: 'SUMMARY#NSDQ:AAPL',
        SK: 'DATE#2024-01-02',
        Type: 'DailySummary',
        GSI4PK: 'NASDAQ',
        GSI4SK: 'DATE#2024-01-02#NSDQ:AAPL',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2024-01-02',
        Open: 100,
        High: 110,
        Low: 95,
        Close: 105,
        Volume: 12345,
        PatternResults: { 'morning-star': 'MATCHED' },
        BuyPatternCount: 1,
        SellPatternCount: 0,
        CreatedAt: created.createdAt,
        UpdatedAt: created.updatedAt,
      });
    });

    it('upsertで任意項目を省くと、上書き後のサマリーにその項目は残らない', async () => {
      await repository.upsert(buildDailySummaryInput({ volume: 12345, buyPatternCount: 1 }));

      await repository.upsert(buildDailySummaryInput());

      const fetched = await repository.getByTickerAndDate('NSDQ:AAPL', '2024-01-02');
      expect(fetched?.volume).toBeUndefined();
      expect(fetched?.buyPatternCount).toBeUndefined();
      const raw = await hooks.getRawItem('SUMMARY#NSDQ:AAPL', 'DATE#2024-01-02');
      expect(raw).not.toHaveProperty('Volume');
      expect(raw).not.toHaveProperty('BuyPatternCount');
    });

    describe('旧形式のデータ', () => {
      const LEGACY_CREATED_AT = '2024-01-02T10:00:00.000Z';

      async function putLegacyItem(): Promise<void> {
        await hooks.putRawItem({
          PK: 'SUMMARY#NSDQ:AAPL',
          SK: 'DATE#2024-01-02',
          Type: 'DailySummary',
          GSI4PK: 'NASDAQ',
          GSI4SK: 'DATE#2024-01-02#NSDQ:AAPL',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          Date: '2024-01-02',
          Open: 100,
          High: 110,
          Low: 95,
          Close: 105,
          CreatedAt: LEGACY_CREATED_AT,
          UpdatedAt: '2024-01-03T10:00:00.000Z',
        });
      }

      it('時刻が ISO 文字列のサマリーも、ミリ秒で読める', async () => {
        await putLegacyItem();

        const fetched = await repository.getByTickerAndDate('NSDQ:AAPL', '2024-01-02');

        expect(fetched?.createdAt).toBe(Date.parse(LEGACY_CREATED_AT));
        expect(fetched?.updatedAt).toBe(Date.parse('2024-01-03T10:00:00.000Z'));
      });

      it('getByExchange でも読める', async () => {
        await putLegacyItem();

        const result = await repository.getByExchange('NASDAQ', '2024-01-02');

        expect(result.map((item) => item.tickerId)).toEqual(['NSDQ:AAPL']);
      });

      it('upsert すると作成日時を引き継ぎ、時刻が数値ミリ秒に置き換わる', async () => {
        await putLegacyItem();

        const overwritten = await repository.upsert(buildDailySummaryInput({ close: 120 }));

        expect(overwritten.createdAt).toBe(Date.parse(LEGACY_CREATED_AT));
        const raw = await hooks.getRawItem('SUMMARY#NSDQ:AAPL', 'DATE#2024-01-02');
        expect(raw?.CreatedAt).toBe(Date.parse(LEGACY_CREATED_AT));
        expect(typeof raw?.UpdatedAt).toBe('number');
      });
    });

    describe('読めないサマリー', () => {
      async function putBrokenItem(): Promise<void> {
        await hooks.putRawItem({
          PK: 'SUMMARY#NSDQ:AAPL',
          SK: 'DATE#2024-01-02',
          Type: 'DailySummary',
          GSI4PK: 'NASDAQ',
          GSI4SK: 'DATE#2024-01-02#NSDQ:AAPL',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          Date: '2024-01-02',
          Open: 100,
          High: 110,
          Low: 95,
          Close: 'broken',
          CreatedAt: 1_700_000_000_000,
          UpdatedAt: 1_700_000_000_000,
        });
      }

      it('getByTickerAndDate は InvalidEntityDataError をスローする', async () => {
        await putBrokenItem();

        await expect(repository.getByTickerAndDate('NSDQ:AAPL', '2024-01-02')).rejects.toThrow(
          expect.objectContaining({ name: 'InvalidEntityDataError' })
        );
      });

      it.each([
        [
          'getByExchange（date 指定）',
          (repo: DailySummaryRepository) => repo.getByExchange('NASDAQ', '2024-01-02'),
        ],
        [
          'getByExchange（date 省略）',
          (repo: DailySummaryRepository) => repo.getByExchange('NASDAQ'),
        ],
        [
          'getByExchangeAndDateRange',
          (repo: DailySummaryRepository) =>
            repo.getByExchangeAndDateRange('NASDAQ', '2024-01-01', '2024-01-03'),
        ],
      ])('%s は、読み飛ばさず InvalidEntityDataError をスローする', async (_label, query) => {
        await putBrokenItem();

        await expect(query(repository)).rejects.toThrow(
          expect.objectContaining({ name: 'InvalidEntityDataError' })
        );
      });
    });
  });
}
