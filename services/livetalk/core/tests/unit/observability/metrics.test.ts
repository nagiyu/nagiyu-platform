import {
  createChatMetrics,
  emitChatMetricsLog,
  emitChatMetricsEMF,
  emitBatchMetricsLog,
  emitBatchMetricsEMF,
} from '../../../src/observability/metrics.js';

describe('createChatMetrics', () => {
  it('初期値はすべてゼロ・空のまま返す', () => {
    const metrics = createChatMetrics('u1', 'hiyori');
    expect(metrics.userId).toBe('u1');
    expect(metrics.characterId).toBe('hiyori');
    expect(metrics.promptTokens.total).toBe(0);
    expect(metrics.latency).toEqual({});
    expect(metrics.dynamodb).toEqual({});
  });

  it('timestamp が ISO8601 形式である', () => {
    const metrics = createChatMetrics('u1', 'hiyori');
    expect(() => new Date(metrics.timestamp)).not.toThrow();
    expect(new Date(metrics.timestamp).toISOString()).toBe(metrics.timestamp);
  });
});

describe('emitChatMetricsLog', () => {
  it('logger.info を呼び出す（例外を throw しない）', () => {
    const metrics = createChatMetrics('u1', 'hiyori');
    metrics.promptTokens = { system: 100, summary: 0, memory: 50, messages: 200, total: 350 };
    metrics.latency.chatTotal = 1200;
    expect(() => emitChatMetricsLog(metrics)).not.toThrow();
  });

  it('PII（会話本文）がログに含まれない', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const metrics = createChatMetrics('u1', 'hiyori');
    emitChatMetricsLog(metrics);
    const output = logSpy.mock.calls.map((args) => JSON.stringify(args)).join('');
    expect(output).not.toContain('会話本文');
    logSpy.mockRestore();
  });
});

describe('emitChatMetricsEMF', () => {
  it('console.log で EMF JSON を出力する', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const metrics = createChatMetrics('u1', 'hiyori');
    metrics.promptTokens.total = 500;
    metrics.latency.llmTtfb = 400;
    metrics.latency.chatTotal = 1500;
    metrics.latency.retrieve = 100;

    emitChatMetricsEMF(metrics);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed['PromptTotalTokens']).toBe(500);
    expect(parsed['LLMTimeToFirstToken']).toBe(400);
    expect(parsed['ChatTotalLatency']).toBe(1500);
    expect(parsed['RetrieveLatency']).toBe(100);
    expect((parsed['_aws'] as { CloudWatchMetrics: unknown[] }).CloudWatchMetrics).toBeDefined();
    logSpy.mockRestore();
  });

  it('latency が undefined の場合は該当メトリクスを出力しない', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const metrics = createChatMetrics('u1', 'hiyori');

    emitChatMetricsEMF(metrics);

    const output = logSpy.mock.calls[0][0] as string;
    expect(output).not.toContain('LLMTimeToFirstToken');
    expect(output).not.toContain('ChatTotalLatency');
    expect(output).not.toContain('RetrieveLatency');
    logSpy.mockRestore();
  });

  it('例外を throw しない（best-effort）', () => {
    const metrics = createChatMetrics('u1', 'hiyori');
    jest.spyOn(console, 'log').mockImplementation(() => {
      throw new Error('stdout error');
    });
    expect(() => emitChatMetricsEMF(metrics)).toThrow();
    jest.restoreAllMocks();
  });

  it('EMF の Namespace が LiveTalk/Chat である', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const metrics = createChatMetrics('u1', 'hiyori');
    emitChatMetricsEMF(metrics);
    const output = logSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output) as {
      _aws: { CloudWatchMetrics: Array<{ Namespace: string }> };
    };
    expect(parsed._aws.CloudWatchMetrics[0].Namespace).toBe('LiveTalk/Chat');
    logSpy.mockRestore();
  });

  it('LIVETALK_ENV が設定されている場合は Environment ディメンションにその値が使われる', () => {
    const originalEnv = process.env.LIVETALK_ENV;
    process.env.LIVETALK_ENV = 'dev';
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const metrics = createChatMetrics('u1', 'hiyori');
    emitChatMetricsEMF(metrics);
    const output = logSpy.mock.calls[0][0] as string;
    expect(output).toContain('"dev"');
    logSpy.mockRestore();
    if (originalEnv === undefined) {
      delete process.env.LIVETALK_ENV;
    } else {
      process.env.LIVETALK_ENV = originalEnv;
    }
  });

  it('LIVETALK_ENV が未設定の場合は NODE_ENV にフォールバックする', () => {
    const originalLivetalkEnv = process.env.LIVETALK_ENV;
    delete process.env.LIVETALK_ENV;
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const metrics = createChatMetrics('u1', 'hiyori');
    emitChatMetricsEMF(metrics);
    const output = logSpy.mock.calls[0][0] as string;
    // NODE_ENV または 'unknown' のいずれかが Environment ディメンションに入る
    const parsed = JSON.parse(output) as Record<string, unknown>;
    const dimensions = (parsed['_aws'] as { CloudWatchMetrics: Array<{ Dimensions: string[][] }> })
      .CloudWatchMetrics[0].Dimensions;
    expect(dimensions.flat()).toContain('Environment');
    logSpy.mockRestore();
    if (originalLivetalkEnv !== undefined) {
      process.env.LIVETALK_ENV = originalLivetalkEnv;
    }
  });
});

describe('emitBatchMetricsLog', () => {
  it('例外を throw しない', () => {
    const batchMetrics = {
      userId: 'u1',
      characterId: 'hiyori',
      timestamp: new Date().toISOString(),
      messageCount: 10,
      summaryTokenCount: 500,
      summaryCharCount: 1000,
      latencyMs: 2000,
    };
    expect(() => emitBatchMetricsLog(batchMetrics)).not.toThrow();
  });
});

describe('emitBatchMetricsEMF', () => {
  it('EMF の Namespace が LiveTalk/Batch である', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const batchMetrics = {
      userId: 'u1',
      characterId: 'hiyori',
      timestamp: new Date().toISOString(),
      messageCount: 5,
      summaryTokenCount: 300,
      summaryCharCount: 600,
      latencyMs: 1000,
    };

    emitBatchMetricsEMF(batchMetrics);

    const output = logSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output) as {
      _aws: { CloudWatchMetrics: Array<{ Namespace: string }> };
    };
    expect(parsed._aws.CloudWatchMetrics[0].Namespace).toBe('LiveTalk/Batch');
    logSpy.mockRestore();
  });

  it('MemorySummaryTokens と CompressedMessageCount を含む', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const batchMetrics = {
      userId: 'u1',
      characterId: 'hiyori',
      timestamp: new Date().toISOString(),
      messageCount: 7,
      summaryTokenCount: 400,
      summaryCharCount: 800,
      latencyMs: 3000,
    };

    emitBatchMetricsEMF(batchMetrics);

    const output = logSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed['MemorySummaryTokens']).toBe(400);
    expect(parsed['CompressedMessageCount']).toBe(7);
    expect(parsed['BatchLatency']).toBe(3000);
    logSpy.mockRestore();
  });

  it('LIVETALK_ENV が設定されている場合は Environment ディメンションにその値が使われる（Batch）', () => {
    const originalEnv = process.env.LIVETALK_ENV;
    process.env.LIVETALK_ENV = 'dev';
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const batchMetrics = {
      userId: 'u1',
      characterId: 'hiyori',
      timestamp: new Date().toISOString(),
      messageCount: 5,
      summaryTokenCount: 300,
      summaryCharCount: 600,
    };
    emitBatchMetricsEMF(batchMetrics);
    const output = logSpy.mock.calls[0][0] as string;
    expect(output).toContain('"dev"');
    logSpy.mockRestore();
    if (originalEnv === undefined) {
      delete process.env.LIVETALK_ENV;
    } else {
      process.env.LIVETALK_ENV = originalEnv;
    }
  });
});
