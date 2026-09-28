/**
 * forecast バッチの単体テスト
 *
 * 稼働開始前ガード・未処理日を古い順に処理すること（上限つき）・揃った判定・打ち切り・
 * 引け前のガード・3段の順序・冪等性・市場ごとの失敗分離・中立帯の市場をまたいだ引き継ぎ・
 * リプレイの再開と legacyExclusionBefore の適用範囲・リプレイの即時停止・
 * リプレイ最終日の揃った判定・forceNeutralBandOn の既定と効き・
 * computeForDate との一致・バーンインを超えた確率の算出を検証する。
 */

import { InMemorySingleTableStore } from '@nagiyu/aws';
import * as awsModule from '@nagiyu/aws';
import {
  InMemoryDailySummaryRepository,
  InMemoryExchangeRepository,
  InMemoryForecastRepository,
  InMemoryMarketForecastRepository,
  InMemoryModelSnapshotRepository,
  InMemoryPerformanceDailyRepository,
  computeForDate,
  excludeLegacyBackfillRows,
  nominalMarketCloseTime,
} from '@nagiyu/stock-tracker-core';
import type {
  CreateDailySummaryInput,
  DailyBarInput,
  DailySummaryRepository,
  ExchangeSessionInfo,
  ModelSnapshotItem,
  Question,
} from '@nagiyu/stock-tracker-core';
import { handler } from '../../src/forecast.js';
import type { HandlerDependencies, ReplayEvent, ScheduledEvent } from '../../src/forecast.js';

const HOUR_MS = 60 * 60 * 1000;

const TSE: ExchangeSessionInfo & { name: string; key: string } = {
  exchangeId: 'TSE',
  market: 'JP',
  timezone: 'Asia/Tokyo',
  start: '09:00',
  end: '15:00',
  name: 'Tokyo Stock Exchange',
  key: 'TSE',
};

const NASDAQ: ExchangeSessionInfo & { name: string; key: string } = {
  exchangeId: 'NASDAQ',
  market: 'US',
  timezone: 'America/New_York',
  start: '09:30',
  end: '16:00',
  name: 'NASDAQ',
  key: 'NSDQ',
};

function mockScheduledEvent(): ScheduledEvent {
  return {
    version: '0',
    id: 'test-event-id',
    'detail-type': 'Scheduled Event',
    source: 'aws.events',
    account: '123456789012',
    time: '2026-01-06T00:00:00Z',
    region: 'ap-northeast-1',
    resources: ['arn:aws:events:ap-northeast-1:123456789012:rule/test'],
    detail: {},
  };
}

interface TestBar {
  tickerId: string;
  exchangeId: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

async function seedBar(repo: DailySummaryRepository, bar: TestBar): Promise<void> {
  const input: CreateDailySummaryInput = {
    TickerID: bar.tickerId,
    ExchangeID: bar.exchangeId,
    Date: bar.date,
    Open: bar.open,
    High: bar.high,
    Low: bar.low,
    Close: bar.close,
    Volume: bar.volume,
  };
  await repo.upsert(input);
}

async function seedExchanges(
  exchangeRepository: InMemoryExchangeRepository,
  sessions: (ExchangeSessionInfo & { name: string; key: string })[]
): Promise<void> {
  for (const session of sessions) {
    await exchangeRepository.create({
      ExchangeID: session.exchangeId,
      Name: session.name,
      Key: session.key,
      Timezone: session.timezone,
      Start: session.start,
      End: session.end,
      PriceSource: 'tradingview',
      Market: session.market as 'JP' | 'US',
    });
  }
}

/** 稼働開始前ガードを満たすための最小限の ModelSnapshot を直接書き込む */
async function seedMinimalModelSnapshot(
  modelSnapshotRepository: InMemoryModelSnapshotRepository,
  question: Question,
  market: string,
  date: string
): Promise<void> {
  const snapshot: ModelSnapshotItem = {
    question,
    market,
    date,
    modelVersion: 'test',
    alpha: 1,
    weights: {},
    standardization: {},
    baseline: 0.5,
    neutralBand: { lower: -1, upper: 1, decidedOn: date },
    bandHistory: [],
    axisStats: {},
    trainingSize: 0,
    distinctTrainingDates: 0,
    createdAt: 0,
  };
  await modelSnapshotRepository.createIfAbsent(snapshot);
}

describe('forecast batch handler（通常モード）', () => {
  let store: InMemorySingleTableStore;
  let exchangeRepository: InMemoryExchangeRepository;
  let dailySummaryRepository: InMemoryDailySummaryRepository;
  let forecastRepository: InMemoryForecastRepository;
  let marketForecastRepository: InMemoryMarketForecastRepository;
  let modelSnapshotRepository: InMemoryModelSnapshotRepository;
  let performanceDailyRepository: InMemoryPerformanceDailyRepository;
  let dependencies: Omit<HandlerDependencies, 'nowFn'>;

  beforeEach(async () => {
    jest.spyOn(awsModule, 'reportErrorEvent').mockResolvedValue(null);

    store = new InMemorySingleTableStore();
    exchangeRepository = new InMemoryExchangeRepository(store);
    dailySummaryRepository = new InMemoryDailySummaryRepository(store);
    forecastRepository = new InMemoryForecastRepository(store);
    marketForecastRepository = new InMemoryMarketForecastRepository(store);
    modelSnapshotRepository = new InMemoryModelSnapshotRepository(store);
    performanceDailyRepository = new InMemoryPerformanceDailyRepository(store);

    dependencies = {
      exchangeRepository,
      dailySummaryRepository,
      forecastRepository,
      marketForecastRepository,
      modelSnapshotRepository,
      performanceDailyRepository,
    };

    // 市場未設定の取引所（対象外・ログに出すだけ）が紛れ込んでも壊れないことも兼ねて確認する
    await exchangeRepository.create({
      ExchangeID: 'UNSET',
      Name: '市場未設定取引所',
      Key: 'UNSET',
      Timezone: 'UTC',
      Start: '00:00',
      End: '00:00',
      PriceSource: 'tradingview',
    });
    await seedExchanges(exchangeRepository, [TSE]);
  });

  it('リプレイが1回も実施されていない市場では何もしない', async () => {
    const response = await handler(mockScheduledEvent(), {
      ...dependencies,
      nowFn: () => Date.UTC(2026, 0, 6, 12, 0, 0),
    });
    const stats = JSON.parse(response.body).statistics;
    expect(stats.replayNotDone).toBe(1);
    expect(stats.processedMarkets).toBe(0);
  });

  it('その市場のサマリーが1件も無ければ何もしない（稼働開始済みでも）', async () => {
    await seedMinimalModelSnapshot(modelSnapshotRepository, 'DIR', 'JP', '2025-01-01');

    const response = await handler(mockScheduledEvent(), {
      ...dependencies,
      nowFn: () => Date.UTC(2026, 0, 6, 12, 0, 0),
    });
    const stats = JSON.parse(response.body).statistics;
    expect(stats.replayNotDone).toBe(0);
    expect(stats.noMarketData).toBe(1);
    expect(stats.processedMarkets).toBe(0);
  });

  it('未処理の日を古い順に処理し、1回の実行の上限を超えた分は次回に回す', async () => {
    const days = Array.from({ length: 13 }, (_, i) => `2026-02-${String(i + 1).padStart(2, '0')}`);
    // 直前の日（稼働開始日）を ModelSnapshot として既に処理済みとして扱う
    await seedMinimalModelSnapshot(modelSnapshotRepository, 'DIR', 'JP', '2026-01-31');

    for (const date of days) {
      await seedBar(dailySummaryRepository, {
        tickerId: 'TSE:AAA',
        exchangeId: 'TSE',
        date,
        open: 100,
        high: 105,
        low: 95,
        close: 102,
        volume: 1000,
      });
    }

    // 全日程の打ち切り時刻をとうに過ぎた時刻で実行する
    const now = nominalMarketCloseTime('JP', days[days.length - 1], [TSE]) + 48 * HOUR_MS;

    const run1 = await handler(mockScheduledEvent(), { ...dependencies, nowFn: () => now });
    const stats1 = JSON.parse(run1.body).statistics;
    expect(stats1.processedDates).toBe(10); // MAX_DATES_PER_RUN
    expect(stats1.processedMarkets).toBe(1);
    for (const date of days.slice(0, 10)) {
      expect(await marketForecastRepository.getByMarketAndDate('JP', date)).not.toBeNull();
    }
    for (const date of days.slice(10)) {
      expect(await marketForecastRepository.getByMarketAndDate('JP', date)).toBeNull();
    }

    const run2 = await handler(mockScheduledEvent(), { ...dependencies, nowFn: () => now });
    const stats2 = JSON.parse(run2.body).statistics;
    expect(stats2.processedDates).toBe(3); // 残り3日
    for (const date of days.slice(10)) {
      expect(await marketForecastRepository.getByMarketAndDate('JP', date)).not.toBeNull();
    }

    const run3 = await handler(mockScheduledEvent(), { ...dependencies, nowFn: () => now });
    const stats3 = JSON.parse(run3.body).statistics;
    expect(stats3.alreadyUpToDate).toBe(1);
    expect(stats3.processedDates).toBe(0);
  });

  it('引け前のD は処理しない', async () => {
    const bootstrapDate = '2026-02-01';
    const futureDate = '2026-02-02';
    await seedMinimalModelSnapshot(modelSnapshotRepository, 'DIR', 'JP', bootstrapDate);
    await seedBar(dailySummaryRepository, {
      tickerId: 'TSE:AAA',
      exchangeId: 'TSE',
      date: futureDate,
      open: 100,
      high: 105,
      low: 95,
      close: 102,
      volume: 1000,
    });

    // futureDate の名目引け時刻より前の時刻で実行する
    const now = nominalMarketCloseTime('JP', futureDate, [TSE]) - HOUR_MS;
    const response = await handler(mockScheduledEvent(), { ...dependencies, nowFn: () => now });
    const stats = JSON.parse(response.body).statistics;

    expect(stats.processedDates).toBe(0);
    expect(await marketForecastRepository.getByMarketAndDate('JP', futureDate)).toBeNull();
  });

  it('揃った判定・打ち切り・3段の順序・冪等性を検証する', async () => {
    const bootstrapDate = '2026-01-04';
    const d0 = '2026-01-05';
    const d1 = '2026-01-06';

    // 稼働開始日として1日リプレイしておく（稼働開始前ガードを満たすと同時に、
    // 実運用と同じ「リプレイの続きから通常モードが始まる」流れを再現する）
    await seedBar(dailySummaryRepository, {
      tickerId: 'TSE:AAA',
      exchangeId: 'TSE',
      date: bootstrapDate,
      open: 90,
      high: 95,
      low: 85,
      close: 92,
      volume: 900,
    });
    const replayEvent: ReplayEvent = { mode: 'replay', legacyExclusionBefore: bootstrapDate };
    await handler(replayEvent, { ...dependencies, nowFn: () => Date.UTC(2026, 5, 1) });
    expect(await modelSnapshotRepository.getByDate('DIR', 'JP', bootstrapDate)).not.toBeNull();

    await seedBar(dailySummaryRepository, {
      tickerId: 'TSE:AAA',
      exchangeId: 'TSE',
      date: d0,
      open: 100,
      high: 105,
      low: 95,
      close: 102,
      volume: 1000,
    });
    await seedBar(dailySummaryRepository, {
      tickerId: 'TSE:BBB',
      exchangeId: 'TSE',
      date: d0,
      open: 200,
      high: 205,
      low: 195,
      close: 202,
      volume: 2000,
    });

    // --- Run1: D0 を処理する（前日は稼働開始日のみで銘柄が無いため判定はスキップされる） ---
    const closeD0 = nominalMarketCloseTime('JP', d0, [TSE]);
    const run1 = await handler(mockScheduledEvent(), {
      ...dependencies,
      nowFn: () => closeD0 + 1000,
    });
    const stats1 = JSON.parse(run1.body).statistics;
    expect(run1.statusCode).toBe(200);
    expect(stats1.totalMarkets).toBe(1); // UNSET 取引所は市場として数えない
    expect(stats1.processedDates).toBe(1);

    const forecastAaaD0 = await forecastRepository.getByTickerAndDate('TSE:AAA', d0);
    const forecastBbbD0 = await forecastRepository.getByTickerAndDate('TSE:BBB', d0);
    expect(forecastAaaD0).not.toBeNull();
    expect(forecastBbbD0).not.toBeNull();
    expect(forecastAaaD0?.Source).toBe('LIVE');
    expect(forecastAaaD0?.Probabilities).toEqual({}); // バーンイン未達
    expect(forecastAaaD0?.Outcome).toBeUndefined();

    // CCC は D0 の確度算出（Run1）が終わった後にサマリーが届く（本来 D0 時点に存在すべきだった
    // データの遅延到着を模す）。D0 の Forecast は既に打ち切られているため、後から D0・D1 の両方の
    // サマリーが揃っても D0 の Forecast は作られない（採点時に対象の Forecast が無い状態になる）。
    await seedBar(dailySummaryRepository, {
      tickerId: 'TSE:CCC',
      exchangeId: 'TSE',
      date: d0,
      open: 300,
      high: 305,
      low: 295,
      close: 302,
      volume: 3000,
    });
    await seedBar(dailySummaryRepository, {
      tickerId: 'TSE:CCC',
      exchangeId: 'TSE',
      date: d1,
      open: 302,
      high: 310,
      low: 298,
      close: 305,
      volume: 3100,
    });

    // D1 が来るが BBB のサマリーがまだ無い（揃っていない）
    await seedBar(dailySummaryRepository, {
      tickerId: 'TSE:AAA',
      exchangeId: 'TSE',
      date: d1,
      open: 102,
      high: 110,
      low: 100,
      close: 108,
      volume: 1100,
    });

    // --- Run2: 揃っていない・打ち切り時刻より前 → 何もしない ---
    const closeD1 = nominalMarketCloseTime('JP', d1, [TSE]);
    const run2 = await handler(mockScheduledEvent(), {
      ...dependencies,
      nowFn: () => closeD1 + 1000,
    });
    const stats2 = JSON.parse(run2.body).statistics;
    expect(stats2.waitingForData).toBe(1);
    expect(stats2.processedDates).toBe(0);
    expect(await marketForecastRepository.getByMarketAndDate('JP', d1)).toBeNull();
    expect((await forecastRepository.getByTickerAndDate('TSE:AAA', d0))?.Outcome).toBeUndefined();

    // --- Run3: 打ち切り時刻を過ぎた → 揃っている AAA・CCC だけで確度を算出し、D0 を採点する ---
    const run3 = await handler(mockScheduledEvent(), {
      ...dependencies,
      nowFn: () => closeD1 + 13 * HOUR_MS,
    });
    const stats3 = JSON.parse(run3.body).statistics;
    expect(run3.statusCode).toBe(200);
    expect(stats3.processedDates).toBe(1);

    expect(await marketForecastRepository.getByMarketAndDate('JP', d1)).not.toBeNull();
    expect(await forecastRepository.getByTickerAndDate('TSE:AAA', d1)).not.toBeNull();
    expect(await forecastRepository.getByTickerAndDate('TSE:CCC', d1)).not.toBeNull();
    // 打ち切りで欠けた BBB は D1 の確度なしで確定する
    expect(await forecastRepository.getByTickerAndDate('TSE:BBB', d1)).toBeNull();

    // 段階1: D0 の採点（AAA は D1 の実績があるので採点され、BBB は無いので採点されない）
    const scoredAaaD0 = await forecastRepository.getByTickerAndDate('TSE:AAA', d0);
    expect(scoredAaaD0?.Outcome).toBeDefined();
    expect(scoredAaaD0?.Outcome?.nextDate).toBe(d1);
    expect(scoredAaaD0?.Outcome?.hit.DIR).toBeDefined();
    const scoredBbbD0 = await forecastRepository.getByTickerAndDate('TSE:BBB', d0);
    expect(scoredBbbD0?.Outcome).toBeUndefined();
    // CCC は D1 の確度算出には加わるが、D0 の Forecast 自体が存在しないため
    // 採点（Outcome の追記）はスキップされる（例外を投げずに継続する）
    expect(await forecastRepository.getByTickerAndDate('TSE:CCC', d0)).toBeNull();

    const performanceD0 = await performanceDailyRepository.getByDate('DIR', 'JP', d0);
    expect(performanceD0?.evaluatedCount).toBe(1);

    // 段階2: D1 の重みの更新（稼働開始日・AAA の D0 サンプルがいずれも学習に使えるようになっている）
    const snapshotD1 = await modelSnapshotRepository.getByDate('DIR', 'JP', d1);
    expect(snapshotD1?.trainingSize).toBe(2);

    // 段階3: D1 の確度算出（学習件数がまだ少なくバーンイン未達のため確率は出さない）
    expect((await forecastRepository.getByTickerAndDate('TSE:AAA', d1))?.Probabilities).toEqual({});

    // --- 冪等性: 同じ入力で再実行しても書き換わらず、何もしなかったと報告される ---
    const beforeAaaD0 = await forecastRepository.getByTickerAndDate('TSE:AAA', d0);
    const beforeAaaD1 = await forecastRepository.getByTickerAndDate('TSE:AAA', d1);
    const beforeSnapshotD1 = await modelSnapshotRepository.getByDate('DIR', 'JP', d1);

    const run3Again = await handler(mockScheduledEvent(), {
      ...dependencies,
      nowFn: () => closeD1 + 13 * HOUR_MS,
    });
    const stats3Again = JSON.parse(run3Again.body).statistics;
    expect(stats3Again.alreadyUpToDate).toBe(1);
    expect(stats3Again.processedDates).toBe(0);

    expect(await forecastRepository.getByTickerAndDate('TSE:AAA', d0)).toEqual(beforeAaaD0);
    expect(await forecastRepository.getByTickerAndDate('TSE:AAA', d1)).toEqual(beforeAaaD1);
    expect(await modelSnapshotRepository.getByDate('DIR', 'JP', d1)).toEqual(beforeSnapshotD1);
  });
});

describe('forecast batch handler（市場ごとの失敗分離）', () => {
  it('1つの市場の失敗が他の市場を止めず、最後に例外を投げる', async () => {
    jest.spyOn(awsModule, 'reportErrorEvent').mockResolvedValue(null);

    const store = new InMemorySingleTableStore();
    const exchangeRepository = new InMemoryExchangeRepository(store);
    const realDailySummaryRepository = new InMemoryDailySummaryRepository(store);
    const forecastRepository = new InMemoryForecastRepository(store);
    const marketForecastRepository = new InMemoryMarketForecastRepository(store);
    const modelSnapshotRepository = new InMemoryModelSnapshotRepository(store);
    const performanceDailyRepository = new InMemoryPerformanceDailyRepository(store);

    await seedExchanges(exchangeRepository, [TSE, NASDAQ]);
    const d0 = '2026-01-05';
    // 両市場ともリプレイ実施済みとして扱う（稼働開始前ガードの対象外にする）
    await seedMinimalModelSnapshot(modelSnapshotRepository, 'DIR', 'JP', '2025-01-01');
    await seedMinimalModelSnapshot(modelSnapshotRepository, 'DIR', 'US', '2025-01-01');

    await seedBar(realDailySummaryRepository, {
      tickerId: 'TSE:AAA',
      exchangeId: 'TSE',
      date: d0,
      open: 100,
      high: 105,
      low: 95,
      close: 102,
      volume: 1000,
    });
    await seedBar(realDailySummaryRepository, {
      tickerId: 'NASDAQ:ZZZ',
      exchangeId: 'NASDAQ',
      date: d0,
      open: 50,
      high: 52,
      low: 48,
      close: 51,
      volume: 500,
    });

    // NASDAQ（US）の読み出しだけ失敗させる。市場ごとの try/catch で分離されることを確認する
    const dailySummaryRepository: DailySummaryRepository = {
      getByTickerAndDate: (...args) => realDailySummaryRepository.getByTickerAndDate(...args),
      getByExchange: (...args) => realDailySummaryRepository.getByExchange(...args),
      getByExchangeAndDateRange: (...args) =>
        realDailySummaryRepository.getByExchangeAndDateRange(...args),
      getForecastFieldsByExchangeAndDateRange: (exchangeId, fromDate, toDate) => {
        if (exchangeId === 'NASDAQ') {
          return Promise.reject(new Error('DynamoDB 障害'));
        }
        return realDailySummaryRepository.getForecastFieldsByExchangeAndDateRange(
          exchangeId,
          fromDate,
          toDate
        );
      },
      upsert: (...args) => realDailySummaryRepository.upsert(...args),
      markAsEvaluated: (...args) => realDailySummaryRepository.markAsEvaluated(...args),
    };

    const now = nominalMarketCloseTime('US', d0, [TSE, NASDAQ]) + 1000;
    const deps: HandlerDependencies = {
      exchangeRepository,
      dailySummaryRepository,
      forecastRepository,
      marketForecastRepository,
      modelSnapshotRepository,
      performanceDailyRepository,
      nowFn: () => now,
    };

    await expect(handler(mockScheduledEvent(), deps)).rejects.toThrow(/失敗/);

    expect(await marketForecastRepository.getByMarketAndDate('JP', d0)).not.toBeNull();
    expect(await marketForecastRepository.getByMarketAndDate('US', d0)).toBeNull();
    expect(awsModule.reportErrorEvent).toHaveBeenCalled();
  });
});

describe('forecast batch handler（リプレイモード）', () => {
  let store: InMemorySingleTableStore;
  let exchangeRepository: InMemoryExchangeRepository;
  let dailySummaryRepository: InMemoryDailySummaryRepository;
  let forecastRepository: InMemoryForecastRepository;
  let marketForecastRepository: InMemoryMarketForecastRepository;
  let modelSnapshotRepository: InMemoryModelSnapshotRepository;
  let performanceDailyRepository: InMemoryPerformanceDailyRepository;
  let dependencies: Omit<HandlerDependencies, 'nowFn'>;

  // 過去データ除外の判定は CreatedAt（テスト実行時の実時刻）と翌営業日の取引開始時刻を比較するため、
  // テスト実行時刻より確実に先の日付を使う（過去日付だと常に除外に該当してしまう）。
  const d1 = '2030-01-07';
  const d2 = '2030-01-08'; // 重複 OHLC。legacyExclusionBefore より前なので除外される
  const d3 = '2030-01-09'; // legacyExclusionBefore
  const d4 = '2030-01-10';
  const d5 = '2030-01-11'; // 重複 OHLC。legacyExclusionBefore 以降なので除外されない
  const d6 = '2030-01-14';
  const allDates = [d1, d2, d3, d4, d5, d6];
  // 全日程の打ち切り時刻をとうに過ぎた時刻
  const now = nominalMarketCloseTime('JP', d6, [TSE]) + 48 * HOUR_MS;

  /**
   * beforeEach で DailySummary に書き込むのと同じ ANCHOR・DUP・DUP2 のバーを
   * {@link DailyBarInput} の形で返す（computeForDate との突き合わせ用）。
   */
  function buildFixtureBars(): DailyBarInput[] {
    const bars: DailyBarInput[] = [];
    for (let i = 0; i < allDates.length; i++) {
      bars.push({
        tickerId: 'TSE:ANCHOR',
        exchangeId: 'TSE',
        date: allDates[i],
        open: 100 + i,
        high: 106 + i,
        low: 94 + i,
        close: 101 + i * 2,
        volume: 1000 + i * 10,
        createdAt: 0,
      });
    }
    bars.push(
      {
        tickerId: 'TSE:DUP',
        exchangeId: 'TSE',
        date: d1,
        open: 10,
        high: 11,
        low: 9,
        close: 10.5,
        volume: 500,
        createdAt: 0,
      },
      {
        tickerId: 'TSE:DUP',
        exchangeId: 'TSE',
        date: d2,
        open: 10,
        high: 11,
        low: 9,
        close: 10.5,
        volume: 500,
        createdAt: 0,
      },
      {
        tickerId: 'TSE:DUP2',
        exchangeId: 'TSE',
        date: d4,
        open: 20,
        high: 21,
        low: 19,
        close: 20.5,
        volume: 600,
        createdAt: 0,
      },
      {
        tickerId: 'TSE:DUP2',
        exchangeId: 'TSE',
        date: d5,
        open: 20,
        high: 21,
        low: 19,
        close: 20.5,
        volume: 600,
        createdAt: 0,
      },
      {
        tickerId: 'TSE:DUP2',
        exchangeId: 'TSE',
        date: d6,
        open: 21,
        high: 22,
        low: 20,
        close: 21.5,
        volume: 610,
        createdAt: 0,
      }
    );
    return bars;
  }

  beforeEach(async () => {
    jest.spyOn(awsModule, 'reportErrorEvent').mockResolvedValue(null);

    store = new InMemorySingleTableStore();
    exchangeRepository = new InMemoryExchangeRepository(store);
    dailySummaryRepository = new InMemoryDailySummaryRepository(store);
    forecastRepository = new InMemoryForecastRepository(store);
    marketForecastRepository = new InMemoryMarketForecastRepository(store);
    modelSnapshotRepository = new InMemoryModelSnapshotRepository(store);
    performanceDailyRepository = new InMemoryPerformanceDailyRepository(store);

    dependencies = {
      exchangeRepository,
      dailySummaryRepository,
      forecastRepository,
      marketForecastRepository,
      modelSnapshotRepository,
      performanceDailyRepository,
    };

    await seedExchanges(exchangeRepository, [TSE]);

    // ANCHOR: 毎日異なる値幅で観測カレンダーを 6 日分そろえる（除外の影響を受けない）
    for (let i = 0; i < allDates.length; i++) {
      await seedBar(dailySummaryRepository, {
        tickerId: 'TSE:ANCHOR',
        exchangeId: 'TSE',
        date: allDates[i],
        open: 100 + i,
        high: 106 + i,
        low: 94 + i,
        close: 101 + i * 2,
        volume: 1000 + i * 10,
      });
    }

    // DUP: d1→d2 が OHLC 完全一致（d2 は legacyExclusionBefore=d3 より前なので除外される）
    await seedBar(dailySummaryRepository, {
      tickerId: 'TSE:DUP',
      exchangeId: 'TSE',
      date: d1,
      open: 10,
      high: 11,
      low: 9,
      close: 10.5,
      volume: 500,
    });
    await seedBar(dailySummaryRepository, {
      tickerId: 'TSE:DUP',
      exchangeId: 'TSE',
      date: d2,
      open: 10,
      high: 11,
      low: 9,
      close: 10.5,
      volume: 500,
    });

    // DUP2: d4→d5 が OHLC 完全一致（d5 は legacyExclusionBefore=d3 以降なので除外されない）。
    // d6 にも観測を持たせ、リプレイ最終日の揃った判定（d6）に影響しないようにする。
    await seedBar(dailySummaryRepository, {
      tickerId: 'TSE:DUP2',
      exchangeId: 'TSE',
      date: d4,
      open: 20,
      high: 21,
      low: 19,
      close: 20.5,
      volume: 600,
    });
    await seedBar(dailySummaryRepository, {
      tickerId: 'TSE:DUP2',
      exchangeId: 'TSE',
      date: d5,
      open: 20,
      high: 21,
      low: 19,
      close: 20.5,
      volume: 600,
    });
    await seedBar(dailySummaryRepository, {
      tickerId: 'TSE:DUP2',
      exchangeId: 'TSE',
      date: d6,
      open: 21,
      high: 22,
      low: 20,
      close: 21.5,
      volume: 610,
    });
  });

  it('legacyExclusionBefore より前だけに除外を適用し、再実行で続きから進む', async () => {
    // --- 1回目: d1〜d3 だけを対象に実行（15分制限に収まらない場合の分割実行を模す） ---
    const replayEvent1: ReplayEvent = {
      mode: 'replay',
      legacyExclusionBefore: d3,
      from: d1,
      to: d3,
      forceNeutralBandOn: d3,
    };
    const run1 = await handler(replayEvent1, { ...dependencies, nowFn: () => now });
    const stats1 = JSON.parse(run1.body).statistics;
    expect(run1.statusCode).toBe(200);
    expect(stats1.totalSteps).toBe(3);
    expect(stats1.processedSteps).toBe(3);
    expect(stats1.alreadyDone).toBe(0);

    expect(await marketForecastRepository.getByMarketAndDate('JP', d1)).not.toBeNull();
    // legacyExclusionBefore より前の重複 OHLC は除外され、その日の Forecast は作られない
    expect(await forecastRepository.getByTickerAndDate('TSE:DUP', d2)).toBeNull();
    expect(await forecastRepository.getByTickerAndDate('TSE:ANCHOR', d2)).not.toBeNull();

    // --- 2回目: 全期間を対象に再実行。既に処理済みの d1〜d3 はスキップして続きから進む ---
    const replayEvent2: ReplayEvent = {
      mode: 'replay',
      legacyExclusionBefore: d3,
      from: d1,
      to: d6,
      forceNeutralBandOn: d6,
    };
    const run2 = await handler(replayEvent2, { ...dependencies, nowFn: () => now });
    const stats2 = JSON.parse(run2.body).statistics;
    expect(run2.statusCode).toBe(200);
    expect(stats2.totalSteps).toBe(6);
    expect(stats2.alreadyDone).toBe(3); // d1〜d3 は再計算しない
    expect(stats2.processedSteps).toBe(3); // d4〜d6 を新たに処理する

    for (const date of allDates) {
      expect(await marketForecastRepository.getByMarketAndDate('JP', date)).not.toBeNull();
      expect(await forecastRepository.getByTickerAndDate('TSE:ANCHOR', date)).not.toBeNull();
    }
    // legacyExclusionBefore 以降の重複 OHLC は除外されず、そのまま確度が作られる
    const dup2AtD5 = await forecastRepository.getByTickerAndDate('TSE:DUP2', d5);
    expect(dup2AtD5).not.toBeNull();
    expect(dup2AtD5?.Source).toBe('REPLAY');

    const body2 = JSON.parse(run2.body);
    expect(body2.snapshotSummary.date).toBe(d6);
    expect(body2.snapshotSummary.questions.DIR).toBeDefined();
  });

  it('ステップ単体の失敗で即座に停止し、以降のステップを処理しない例外を投げる', async () => {
    const realMarketForecastRepository = marketForecastRepository;
    let calls = 0;
    const flakyMarketForecastRepository: typeof marketForecastRepository = Object.assign(
      Object.create(Object.getPrototypeOf(realMarketForecastRepository)),
      realMarketForecastRepository,
      {
        createIfAbsent: (
          input: Parameters<typeof realMarketForecastRepository.createIfAbsent>[0]
        ) => {
          calls++;
          if (calls === 2) {
            return Promise.reject(new Error('一時的な書き込み失敗'));
          }
          return realMarketForecastRepository.createIfAbsent(input);
        },
      }
    );

    const replayEvent: ReplayEvent = {
      mode: 'replay',
      legacyExclusionBefore: d3,
      from: d1,
      to: d3,
    };

    await expect(
      handler(replayEvent, {
        ...dependencies,
        marketForecastRepository: flakyMarketForecastRepository,
        nowFn: () => now,
      })
    ).rejects.toThrow(new RegExp(`${d2}.*一時的な書き込み失敗`));

    // 失敗した d2 の1ステップだけ処理され、その後の d3 は処理されない（即座に停止する）
    expect(await marketForecastRepository.getByMarketAndDate('JP', d1)).not.toBeNull();
    expect(await marketForecastRepository.getByMarketAndDate('JP', d3)).toBeNull();
  });

  it('リプレイ最終日の銘柄サマリーがまだ揃っていなければ、その日は処理せず止める', async () => {
    // DUP2 の d6 サマリーがまだ届いていない状態を作る（d5 にはあるので揃った判定が false になる）
    const storeWithoutFinalDupSummary = new InMemorySingleTableStore();
    const exchangeRepo = new InMemoryExchangeRepository(storeWithoutFinalDupSummary);
    const dailySummaryRepo = new InMemoryDailySummaryRepository(storeWithoutFinalDupSummary);
    const forecastRepo = new InMemoryForecastRepository(storeWithoutFinalDupSummary);
    const marketForecastRepo = new InMemoryMarketForecastRepository(storeWithoutFinalDupSummary);
    const modelSnapshotRepo = new InMemoryModelSnapshotRepository(storeWithoutFinalDupSummary);
    const performanceDailyRepo = new InMemoryPerformanceDailyRepository(
      storeWithoutFinalDupSummary
    );
    await seedExchanges(exchangeRepo, [TSE]);
    for (let i = 0; i < allDates.length; i++) {
      await seedBar(dailySummaryRepo, {
        tickerId: 'TSE:ANCHOR',
        exchangeId: 'TSE',
        date: allDates[i],
        open: 100 + i,
        high: 106 + i,
        low: 94 + i,
        close: 101 + i * 2,
        volume: 1000 + i * 10,
      });
    }
    await seedBar(dailySummaryRepo, {
      tickerId: 'TSE:DUP2',
      exchangeId: 'TSE',
      date: d4,
      open: 20,
      high: 21,
      low: 19,
      close: 20.5,
      volume: 600,
    });
    await seedBar(dailySummaryRepo, {
      tickerId: 'TSE:DUP2',
      exchangeId: 'TSE',
      date: d5,
      open: 20,
      high: 21,
      low: 19,
      close: 20.5,
      volume: 600,
    });
    // d6 の DUP2 サマリーは無い（=まだ揃っていない）

    // 打ち切り時刻より前（d6 の引けからまだ間もない）時刻で実行する
    const beforeCutoff = nominalMarketCloseTime('JP', d6, [TSE]) + HOUR_MS;
    const replayEvent: ReplayEvent = { mode: 'replay', legacyExclusionBefore: d3 };

    const response = await handler(replayEvent, {
      exchangeRepository: exchangeRepo,
      dailySummaryRepository: dailySummaryRepo,
      forecastRepository: forecastRepo,
      marketForecastRepository: marketForecastRepo,
      modelSnapshotRepository: modelSnapshotRepo,
      performanceDailyRepository: performanceDailyRepo,
      nowFn: () => beforeCutoff,
    });
    const stats = JSON.parse(response.body).statistics;

    expect(response.statusCode).toBe(200);
    expect(stats.processedSteps).toBe(5); // d1〜d5 は処理される
    expect(await marketForecastRepo.getByMarketAndDate('JP', d5)).not.toBeNull();
    expect(await marketForecastRepo.getByMarketAndDate('JP', d6)).toBeNull();
  });

  it('to を省略したときだけ、最終日を forceNeutralBandOn の既定にする', async () => {
    const replayEventWithTo: ReplayEvent = {
      mode: 'replay',
      legacyExclusionBefore: d3,
      from: d1,
      to: d3,
      // forceNeutralBandOn を明示しない
    };
    await handler(replayEventWithTo, { ...dependencies, nowFn: () => now });

    const snapshotWithTo = await modelSnapshotRepository.getByDate('DIR', 'JP', d3);
    // to を指定した分割実行では強制判定しない（見直し間隔に達していなければ decidedOn は
    // 引き継がれた値のままで d3 にはならない）
    expect(snapshotWithTo?.neutralBand.decidedOn).not.toBe(d3);
  });

  it('forceNeutralBandOn を指定すると、その日の中立帯の判定をやり直す', async () => {
    const replayEvent: ReplayEvent = {
      mode: 'replay',
      legacyExclusionBefore: d3,
      from: d1,
      to: d3,
      forceNeutralBandOn: d3,
    };
    await handler(replayEvent, { ...dependencies, nowFn: () => now });

    const snapshot = await modelSnapshotRepository.getByDate('DIR', 'JP', d3);
    expect(snapshot?.neutralBand.decidedOn).toBe(d3);
  });

  it('JP・US をまたいで、問いごとに最も新しく判定された中立帯を引き継ぐ', async () => {
    await seedExchanges(exchangeRepository, [NASDAQ]);
    // US 側にも同じ観測カレンダーを持たせる（JP より引けが遅いので、同じ日なら JP が先に処理される）
    for (let i = 0; i < allDates.length; i++) {
      await seedBar(dailySummaryRepository, {
        tickerId: 'NASDAQ:ANCHOR',
        exchangeId: 'NASDAQ',
        date: allDates[i],
        open: 50 + i,
        high: 53 + i,
        low: 47 + i,
        close: 51 + i,
        volume: 500 + i * 5,
      });
    }

    const replayEvent: ReplayEvent = {
      mode: 'replay',
      legacyExclusionBefore: d3,
      from: d1,
      to: d1,
      forceNeutralBandOn: d1,
    };
    await handler(replayEvent, { ...dependencies, nowFn: () => now });

    const jpSnapshot = await modelSnapshotRepository.getByDate('DIR', 'JP', d1);
    const usSnapshot = await modelSnapshotRepository.getByDate('DIR', 'US', d1);
    expect(jpSnapshot).not.toBeNull();
    expect(usSnapshot).not.toBeNull();
    // JP の d1 は US の d1 より先に引けるため、US の d1 は JP の d1 で判定された
    // 中立帯を引き継ぐ（forceNeutralBandOn は JP にしかかけていないため、US 側は
    // 継承していなければ decidedOn が d1 にはならない）
    expect(jpSnapshot?.neutralBand.decidedOn).toBe(d1);
    expect(usSnapshot?.neutralBand).toEqual(jpSnapshot?.neutralBand);
  });

  it('リプレイの結果が computeForDate と一致する（小さなフィクスチャ）', async () => {
    const replayEvent: ReplayEvent = {
      mode: 'replay',
      legacyExclusionBefore: d3,
    };
    await handler(replayEvent, { ...dependencies, nowFn: () => now });

    // バッチが実際に見たのと同じバー（ANCHOR・DUP・DUP2 全部、除外適用後）で突き合わせる
    const excludedBars = excludeLegacyBackfillRows(buildFixtureBars(), [TSE], d3);
    const expected = computeForDate(excludedBars, d6, 'JP', [TSE]);
    const expectedAnchor = expected.tickers.find((t) => t.tickerId === 'TSE:ANCHOR');
    const actualAnchor = await forecastRepository.getByTickerAndDate('TSE:ANCHOR', d6);

    expect(actualAnchor?.AxisValues).toEqual(expectedAnchor?.axisValues);

    const expectedSnapshot = expected.modelSnapshots.DIR;
    const actualSnapshot = await modelSnapshotRepository.getByDate('DIR', 'JP', d6);
    expect(actualSnapshot?.trainingSize).toBe(expectedSnapshot?.trainingSize);
    expect(actualSnapshot?.baseline).toBeCloseTo(expectedSnapshot?.baseline ?? NaN, 8);
  });

  it('DB から補充したサンプルに将来の Outcome があっても、その日の確度算出結果は変わらない', async () => {
    // 2つの独立したストアに、ANCHOR だけの同一データを用意する。片方は d5 までで打ち切り、
    // もう片方は d6 まで続けてリプレイする。段階2は保存済みサンプルを全期間分読むが、
    // 時刻の規則で d5 の予測時点より後のサンプル（d6 の Outcome を含む）は学習から
    // 除外されるため、d5 時点の結果はどちらのストアでも変わらないはずである。
    const seedAnchorOnly = async (
      dailySummaryRepo: InMemoryDailySummaryRepository,
      exchangeRepo: InMemoryExchangeRepository
    ): Promise<void> => {
      await seedExchanges(exchangeRepo, [TSE]);
      for (let i = 0; i < allDates.length; i++) {
        await seedBar(dailySummaryRepo, {
          tickerId: 'TSE:ANCHOR',
          exchangeId: 'TSE',
          date: allDates[i],
          open: 100 + i,
          high: 106 + i,
          low: 94 + i,
          close: 101 + i * 2,
          volume: 1000 + i * 10,
        });
      }
    };

    const storeUpToD5 = new InMemorySingleTableStore();
    const exchangeRepoUpToD5 = new InMemoryExchangeRepository(storeUpToD5);
    const dailySummaryRepoUpToD5 = new InMemoryDailySummaryRepository(storeUpToD5);
    const forecastRepoUpToD5 = new InMemoryForecastRepository(storeUpToD5);
    const marketForecastRepoUpToD5 = new InMemoryMarketForecastRepository(storeUpToD5);
    const modelSnapshotRepoUpToD5 = new InMemoryModelSnapshotRepository(storeUpToD5);
    const performanceDailyRepoUpToD5 = new InMemoryPerformanceDailyRepository(storeUpToD5);
    await seedAnchorOnly(dailySummaryRepoUpToD5, exchangeRepoUpToD5);
    await handler(
      { mode: 'replay', legacyExclusionBefore: d3, from: d1, to: d5 },
      {
        exchangeRepository: exchangeRepoUpToD5,
        dailySummaryRepository: dailySummaryRepoUpToD5,
        forecastRepository: forecastRepoUpToD5,
        marketForecastRepository: marketForecastRepoUpToD5,
        modelSnapshotRepository: modelSnapshotRepoUpToD5,
        performanceDailyRepository: performanceDailyRepoUpToD5,
        nowFn: () => now,
      }
    );
    const baselineSnapshot = await modelSnapshotRepoUpToD5.getByDate('DIR', 'JP', d5);
    const baselineForecast = await forecastRepoUpToD5.getByTickerAndDate('TSE:ANCHOR', d5);

    const storeUpToD6 = new InMemorySingleTableStore();
    const exchangeRepoUpToD6 = new InMemoryExchangeRepository(storeUpToD6);
    const dailySummaryRepoUpToD6 = new InMemoryDailySummaryRepository(storeUpToD6);
    const forecastRepoUpToD6 = new InMemoryForecastRepository(storeUpToD6);
    const marketForecastRepoUpToD6 = new InMemoryMarketForecastRepository(storeUpToD6);
    const modelSnapshotRepoUpToD6 = new InMemoryModelSnapshotRepository(storeUpToD6);
    const performanceDailyRepoUpToD6 = new InMemoryPerformanceDailyRepository(storeUpToD6);
    await seedAnchorOnly(dailySummaryRepoUpToD6, exchangeRepoUpToD6);
    await handler(
      { mode: 'replay', legacyExclusionBefore: d3, from: d1, to: d6 },
      {
        exchangeRepository: exchangeRepoUpToD6,
        dailySummaryRepository: dailySummaryRepoUpToD6,
        forecastRepository: forecastRepoUpToD6,
        marketForecastRepository: marketForecastRepoUpToD6,
        modelSnapshotRepository: modelSnapshotRepoUpToD6,
        performanceDailyRepository: performanceDailyRepoUpToD6,
        nowFn: () => now,
      }
    );
    const fullSnapshot = await modelSnapshotRepoUpToD6.getByDate('DIR', 'JP', d5);
    const fullForecast = await forecastRepoUpToD6.getByTickerAndDate('TSE:ANCHOR', d5);

    expect(fullSnapshot?.trainingSize).toBe(baselineSnapshot?.trainingSize);
    expect(fullSnapshot?.baseline).toBeCloseTo(baselineSnapshot?.baseline ?? NaN, 8);
    expect(fullForecast?.AxisValues).toEqual(baselineForecast?.AxisValues);
  });

  it('バーンインを超えた日数分のデータがあれば確率が算出される', async () => {
    const store2 = new InMemorySingleTableStore();
    const exchangeRepo2 = new InMemoryExchangeRepository(store2);
    const dailySummaryRepo2 = new InMemoryDailySummaryRepository(store2);
    const forecastRepo2 = new InMemoryForecastRepository(store2);
    const marketForecastRepo2 = new InMemoryMarketForecastRepository(store2);
    const modelSnapshotRepo2 = new InMemoryModelSnapshotRepository(store2);
    const performanceDailyRepo2 = new InMemoryPerformanceDailyRepository(store2);
    await seedExchanges(exchangeRepo2, [TSE]);

    const burnInDates: string[] = [];
    const base = Date.UTC(2030, 5, 1);
    for (let i = 0; i < 35; i++) {
      const date = new Date(base + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      burnInDates.push(date);
      // 2銘柄の値動きに差を付け、超過リターンの符号にばらつきを持たせる
      const upDay = i % 2 === 0;
      await seedBar(dailySummaryRepo2, {
        tickerId: 'TSE:UP',
        exchangeId: 'TSE',
        date,
        open: 100,
        high: 106,
        low: 99,
        close: upDay ? 105 : 100,
        volume: 1000,
      });
      await seedBar(dailySummaryRepo2, {
        tickerId: 'TSE:DOWN',
        exchangeId: 'TSE',
        date,
        open: 100,
        high: 101,
        low: 95,
        close: upDay ? 100 : 96,
        volume: 1000,
      });
    }

    const burnInNow =
      nominalMarketCloseTime('JP', burnInDates[burnInDates.length - 1], [TSE]) + 48 * HOUR_MS;
    const replayEvent: ReplayEvent = { mode: 'replay', legacyExclusionBefore: burnInDates[0] };
    const response = await handler(replayEvent, {
      exchangeRepository: exchangeRepo2,
      dailySummaryRepository: dailySummaryRepo2,
      forecastRepository: forecastRepo2,
      marketForecastRepository: marketForecastRepo2,
      modelSnapshotRepository: modelSnapshotRepo2,
      performanceDailyRepository: performanceDailyRepo2,
      nowFn: () => burnInNow,
    });
    expect(response.statusCode).toBe(200);

    const lastDate = burnInDates[burnInDates.length - 1];
    const lastForecast = await forecastRepo2.getByTickerAndDate('TSE:UP', lastDate);
    expect(lastForecast?.Probabilities.DIR).toBeDefined();
  });
});
