import type {
  ForecastEntity,
  ModelSnapshotItem,
  PerformanceDailyItem,
  ProbabilityRecord,
} from '@nagiyu/stock-tracker-core';

export function probabilityRecord(overrides: Partial<ProbabilityRecord> = {}): ProbabilityRecord {
  return {
    probability: 0.56,
    baseline: 0.5,
    neutralBand: { lower: -0.05, upper: 0.05 },
    bandHistory: null,
    lean: 'UP',
    contributions: {},
    lowSampleAxes: [],
    ...overrides,
  };
}

export function forecastEntity(overrides: Partial<ForecastEntity> = {}): ForecastEntity {
  return {
    tickerId: 'NSDQ:AAPL',
    exchangeId: 'NASDAQ',
    market: 'US',
    date: '2026-05-01',
    axisValues: {},
    normal: {},
    probabilities: {},
    modelVersion: 'test',
    source: 'LIVE',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

export function snapshot(overrides: Partial<ModelSnapshotItem> = {}): ModelSnapshotItem {
  return {
    question: 'DIR',
    market: 'US',
    date: '2026-05-01',
    modelVersion: 'test',
    alpha: 1,
    weights: {},
    standardization: {},
    baseline: 0.5,
    neutralBand: { lower: -0.05, upper: 0.05, decidedOn: '2026-04-01' },
    bandHistory: [],
    axisStats: {},
    trainingSize: 100,
    distinctTrainingDates: 40,
    createdAt: 1,
    ...overrides,
  };
}

export function performanceDaily(
  overrides: Partial<PerformanceDailyItem> = {}
): PerformanceDailyItem {
  return {
    question: 'DIR',
    market: 'US',
    date: '2026-05-01',
    evaluatedCount: 0,
    hitCount: 0,
    axisStats: {},
    probabilityBands: [],
    createdAt: 1,
    ...overrides,
  };
}
