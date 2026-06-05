import { buildEmfPayload } from '../../../src/observability/emf.js';

describe('buildEmfPayload', () => {
  it('有効な EMF JSON 文字列を返す', () => {
    const payload = buildEmfPayload({
      namespace: 'LiveTalk/Chat',
      dimensions: { Environment: 'dev', CharacterId: 'hiyori' },
      metrics: [{ name: 'PromptTotalTokens', value: 1234, unit: 'Count' }],
      timestamp: 1_700_000_000_000,
    });

    const parsed = JSON.parse(payload) as Record<string, unknown>;
    expect(parsed).toBeDefined();
  });

  it('_aws.CloudWatchMetrics に正しい Namespace を含む', () => {
    const payload = buildEmfPayload({
      namespace: 'LiveTalk/Chat',
      dimensions: { Environment: 'prod' },
      metrics: [{ name: 'ChatTotalLatency', value: 800, unit: 'Milliseconds' }],
    });

    const parsed = JSON.parse(payload) as {
      _aws: { CloudWatchMetrics: Array<{ Namespace: string }> };
    };
    expect(parsed._aws.CloudWatchMetrics[0].Namespace).toBe('LiveTalk/Chat');
  });

  it('Dimensions に全ディメンションキーが含まれる', () => {
    const payload = buildEmfPayload({
      namespace: 'LiveTalk/Chat',
      dimensions: { Environment: 'dev', CharacterId: 'hiyori' },
      metrics: [{ name: 'TierACount', value: 5, unit: 'Count' }],
    });

    const parsed = JSON.parse(payload) as {
      _aws: { CloudWatchMetrics: Array<{ Dimensions: string[][] }> };
    };
    const dims = parsed._aws.CloudWatchMetrics[0].Dimensions[0];
    expect(dims).toContain('Environment');
    expect(dims).toContain('CharacterId');
  });

  it('メトリクス値がトップレベルに展開される', () => {
    const payload = buildEmfPayload({
      namespace: 'LiveTalk/Chat',
      dimensions: { Environment: 'dev' },
      metrics: [
        { name: 'PromptTotalTokens', value: 500, unit: 'Count' },
        { name: 'LLMTimeToFirstToken', value: 300, unit: 'Milliseconds' },
      ],
    });

    const parsed = JSON.parse(payload) as Record<string, unknown>;
    expect(parsed['PromptTotalTokens']).toBe(500);
    expect(parsed['LLMTimeToFirstToken']).toBe(300);
  });

  it('ディメンション値がトップレベルに展開される', () => {
    const payload = buildEmfPayload({
      namespace: 'LiveTalk/Chat',
      dimensions: { Environment: 'staging', CharacterId: 'hiyori' },
      metrics: [{ name: 'TierACount', value: 3, unit: 'Count' }],
    });

    const parsed = JSON.parse(payload) as Record<string, unknown>;
    expect(parsed['Environment']).toBe('staging');
    expect(parsed['CharacterId']).toBe('hiyori');
  });

  it('Metrics 定義に Name と Unit が含まれる', () => {
    const payload = buildEmfPayload({
      namespace: 'LiveTalk/Batch',
      dimensions: { Environment: 'dev' },
      metrics: [{ name: 'MemorySummaryTokens', value: 800, unit: 'Count' }],
    });

    const parsed = JSON.parse(payload) as {
      _aws: { CloudWatchMetrics: Array<{ Metrics: Array<{ Name: string; Unit: string }> }> };
    };
    const metric = parsed._aws.CloudWatchMetrics[0].Metrics[0];
    expect(metric.Name).toBe('MemorySummaryTokens');
    expect(metric.Unit).toBe('Count');
  });

  it('timestamp を省略した場合は呼び出し時刻が使われる', () => {
    const before = Date.now();
    const payload = buildEmfPayload({
      namespace: 'LiveTalk/Chat',
      dimensions: { Environment: 'dev' },
      metrics: [{ name: 'TierACount', value: 0, unit: 'Count' }],
    });
    const after = Date.now();

    const parsed = JSON.parse(payload) as { _aws: { Timestamp: number } };
    expect(parsed._aws.Timestamp).toBeGreaterThanOrEqual(before);
    expect(parsed._aws.Timestamp).toBeLessThanOrEqual(after);
  });

  it('メトリクスが空でも有効な JSON を生成する', () => {
    const payload = buildEmfPayload({
      namespace: 'LiveTalk/Chat',
      dimensions: { Environment: 'dev' },
      metrics: [],
    });
    expect(() => JSON.parse(payload)).not.toThrow();
  });
});
