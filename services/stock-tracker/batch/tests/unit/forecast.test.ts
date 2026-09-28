/**
 * forecast バッチの単体テスト
 *
 * 揃った判定・打ち切り・3段の順序（採点 → 重みの更新 → 確度の算出）・冪等性・
 * 市場ごとの失敗分離・リプレイの再開と legacyExclusionBefore の適用範囲を検証する。
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
  nominalMarketCloseTime,
} from '@nagiyu/stock-tracker-core';
import type {
  CreateDailySummaryInput,
  DailySummaryRepository,
  ExchangeSessionInfo,
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

  it('揃った判定・打ち切り・3段の順序・冪等性を1つの市場の推移で検証する', async () => {
    const d0 = '2026-01-05';
    const d1 = '2026-01-06';

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

    // --- Run1: D0 のみ観測されている（前日が無いので判定はスキップされ即座に確度を作る） ---
    const closeD0 = nominalMarketCloseTime('JP', d0, [TSE]);
    const run1 = await handler(mockScheduledEvent(), {
      ...dependencies,
      nowFn: () => closeD0 + 1000,
    });
    const stats1 = JSON.parse(run1.body).statistics;
    expect(run1.statusCode).toBe(200);
    expect(stats1.totalMarkets).toBe(1); // UNSET 取引所は市場として数えない
    expect(stats1.processedMarkets).toBe(1);

    const forecastAaaD0 = await forecastRepository.getByTickerAndDate('TSE:AAA', d0);
    const forecastBbbD0 = await forecastRepository.getByTickerAndDate('TSE:BBB', d0);
    expect(forecastAaaD0).not.toBeNull();
    expect(forecastBbbD0).not.toBeNull();
    expect(forecastAaaD0?.Source).toBe('LIVE');
    expect(forecastAaaD0?.Probabilities).toEqual({}); // バーンイン未達
    expect(forecastAaaD0?.Outcome).toBeUndefined(); // 前日が無く採点はまだ
    expect(await marketForecastRepository.getByMarketAndDate('JP', d0)).not.toBeNull();
    const snapshotD0 = await modelSnapshotRepository.getByDate('DIR', 'JP', d0);
    expect(snapshotD0?.trainingSize).toBe(0);

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
    expect(stats2.processedMarkets).toBe(0);
    expect(await marketForecastRepository.getByMarketAndDate('JP', d1)).toBeNull();
    expect((await forecastRepository.getByTickerAndDate('TSE:AAA', d0))?.Outcome).toBeUndefined();

    // --- Run3: 打ち切り時刻を過ぎた → 揃っている AAA だけで確度を算出し、D0 を採点する ---
    const run3 = await handler(mockScheduledEvent(), {
      ...dependencies,
      nowFn: () => closeD1 + 13 * HOUR_MS,
    });
    const stats3 = JSON.parse(run3.body).statistics;
    expect(run3.statusCode).toBe(200);
    expect(stats3.processedMarkets).toBe(1);

    expect(await marketForecastRepository.getByMarketAndDate('JP', d1)).not.toBeNull();
    expect(await forecastRepository.getByTickerAndDate('TSE:AAA', d1)).not.toBeNull();
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
    expect(await forecastRepository.getByTickerAndDate('TSE:CCC', d1)).not.toBeNull();
    expect(await forecastRepository.getByTickerAndDate('TSE:CCC', d0)).toBeNull();

    const performanceD0 = await performanceDailyRepository.getByDate('DIR', 'JP', d0);
    expect(performanceD0?.evaluatedCount).toBe(1);

    // 段階2: D1 の重みの更新（AAA の D0 サンプルが学習に使えるようになっている）
    const snapshotD1 = await modelSnapshotRepository.getByDate('DIR', 'JP', d1);
    expect(snapshotD1?.trainingSize).toBe(1);
    expect(snapshotD1?.distinctTrainingDates).toBe(1);

    // 段階3: D1 の確度算出（学習件数がまだ少なくバーンイン未達のため確率は出さない）
    expect((await forecastRepository.getByTickerAndDate('TSE:AAA', d1))?.Probabilities).toEqual({});

    // --- 冪等性: 同じ入力で再実行しても書き換わらず、何もしなかったと報告される ---
    const run3Again = await handler(mockScheduledEvent(), {
      ...dependencies,
      nowFn: () => closeD1 + 13 * HOUR_MS,
    });
    const stats3Again = JSON.parse(run3Again.body).statistics;
    expect(stats3Again.alreadyUpToDate).toBe(1);
    expect(stats3Again.processedMarkets).toBe(0);
    expect(await forecastRepository.getByTickerAndDate('TSE:AAA', d1)).toEqual(
      await forecastRepository.getByTickerAndDate('TSE:AAA', d1)
    );
    expect((await forecastRepository.getByTickerAndDate('TSE:AAA', d0))?.Outcome).toEqual(
      scoredAaaD0?.Outcome
    );
  });

  it('その市場のサマリーが1件も無ければ何もしない', async () => {
    const response = await handler(mockScheduledEvent(), {
      ...dependencies,
      nowFn: () => Date.UTC(2026, 0, 6, 12, 0, 0),
    });
    const stats = JSON.parse(response.body).statistics;
    expect(stats.noMarketData).toBe(1);
    expect(stats.processedMarkets).toBe(0);
  });
});

describe('forecast batch handler（市場ごとの失敗分離）', () => {
  it('1つの市場の失敗が他の市場を止めない', async () => {
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
      getByExchangeAndDateRange: (exchangeId, fromDate, toDate) => {
        if (exchangeId === 'NASDAQ') {
          return Promise.reject(new Error('DynamoDB 障害'));
        }
        return realDailySummaryRepository.getByExchangeAndDateRange(exchangeId, fromDate, toDate);
      },
      upsert: (...args) => realDailySummaryRepository.upsert(...args),
      markAsEvaluated: (...args) => realDailySummaryRepository.markAsEvaluated(...args),
    };

    const now = nominalMarketCloseTime('US', d0, [TSE, NASDAQ]) + 1000;
    const response = await handler(mockScheduledEvent(), {
      exchangeRepository,
      dailySummaryRepository,
      forecastRepository,
      marketForecastRepository,
      modelSnapshotRepository,
      performanceDailyRepository,
      nowFn: () => now,
    });

    const stats = JSON.parse(response.body).statistics;
    expect(response.statusCode).toBe(500); // アラームで気づけるようエラーを返す
    expect(stats.totalMarkets).toBe(2);
    expect(stats.errors).toBe(1);
    expect(stats.processedMarkets).toBe(1); // JP は失敗の影響を受けず処理される

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

  // 過去データ除外の「途中足」判定は CreatedAt（テスト実行時の実時刻）と翌営業日の取引開始
  // 時刻を比較するため、テスト実行時刻より確実に先の日付を使う（過去日付だと常に該当してしまう）。
  const d1 = '2030-01-07';
  const d2 = '2030-01-08'; // 重複 OHLC。legacyExclusionBefore より前なので除外される
  const d3 = '2030-01-09'; // legacyExclusionBefore
  const d4 = '2030-01-10';
  const d5 = '2030-01-11'; // 重複 OHLC。legacyExclusionBefore 以降なので除外されない
  const d6 = '2030-01-14';
  const allDates = [d1, d2, d3, d4, d5, d6];

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

    // DUP2: d4→d5 が OHLC 完全一致（d5 は legacyExclusionBefore=d3 以降なので除外されない）
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
    const run1 = await handler(replayEvent1, {
      ...dependencies,
      nowFn: () => Date.UTC(2026, 5, 1),
    });
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
    };
    const run2 = await handler(replayEvent2, {
      ...dependencies,
      nowFn: () => Date.UTC(2026, 5, 1),
    });
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

  it('ステップ単体の失敗は他のステップの処理を止めない', async () => {
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
    const response = await handler(replayEvent, {
      ...dependencies,
      marketForecastRepository: flakyMarketForecastRepository,
      nowFn: () => Date.UTC(2026, 5, 1),
    });
    const stats = JSON.parse(response.body).statistics;

    expect(response.statusCode).toBe(500);
    expect(stats.errors).toBe(1);
    expect(stats.processedSteps).toBe(2); // 失敗した1ステップ以外は処理が続く
    expect(await marketForecastRepository.getByMarketAndDate('JP', d1)).not.toBeNull();
    expect(await marketForecastRepository.getByMarketAndDate('JP', d3)).not.toBeNull();
  });
});
