import OpenAI from 'openai';
import { generateAiAnalysis } from '../../../src/lib/openai-client.js';

const mockParse = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    responses: {
      parse: mockParse,
    },
  })),
}));

jest.mock('../../../src/lib/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const testInput = {
  tickerId: 'NSDQ:AAPL',
  name: 'Apple Inc.',
  date: '2026-03-04',
  open: 100,
  high: 120,
  low: 95,
  close: 110,
  buyPatternCount: 2,
  sellPatternCount: 1,
  patternSummary: 'ゴールデンクロス, RSI買いシグナル',
  historicalData: [
    {
      date: '2026-03-03',
      open: 99,
      high: 105,
      low: 97,
      close: 103,
    },
    {
      date: '2026-03-04',
      open: 100,
      high: 120,
      low: 95,
      close: 110,
    },
  ],
};

describe('generateAiAnalysis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('正常系: AI解析テキストを返す', async () => {
    mockParse.mockResolvedValue({
      output_parsed: {
        priceMovementAnalysis: '当日の値動き分析',
        patternAnalysis: 'パターン分析',
        supportLevels: [100, 99, 98],
        resistanceLevels: [110, 111, 112],
        relatedMarketTrend: '市場動向',
        investmentJudgment: { signal: 'NEUTRAL', reason: '様子見' },
      },
    });

    const result = await generateAiAnalysis('test-api-key', testInput);

    expect(result).toEqual(
      expect.objectContaining({
        priceMovementAnalysis: '当日の値動き分析',
      })
    );
    expect(OpenAI).toHaveBeenCalledWith({
      apiKey: 'test-api-key',
      maxRetries: 0,
    });
    expect(mockParse).toHaveBeenCalledTimes(1);
    expect(mockParse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-5-mini',
        tools: [{ type: 'web_search' }],
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: expect.stringContaining('【過去価格推移（取得件数: 2件）】'),
              },
            ],
          },
        ],
      })
    );
    const parseArgument = mockParse.mock.calls[0][0] as {
      text: {
        format: {
          schema?: {
            properties?: {
              supportLevels?: {
                minItems?: number;
                maxItems?: number;
                items?: unknown;
              };
              resistanceLevels?: {
                minItems?: number;
                maxItems?: number;
                items?: unknown;
              };
            };
          };
        };
      };
    };

    expect(parseArgument.text.format.schema?.properties?.supportLevels).toEqual(
      expect.objectContaining({
        minItems: 3,
        maxItems: 3,
        items: expect.objectContaining({
          type: 'number',
        }),
      })
    );
    expect(Array.isArray(parseArgument.text.format.schema?.properties?.supportLevels?.items)).toBe(
      false
    );
    expect(parseArgument.text.format.schema?.properties?.resistanceLevels).toEqual(
      expect.objectContaining({
        minItems: 3,
        maxItems: 3,
        items: expect.objectContaining({
          type: 'number',
        }),
      })
    );
    expect(
      Array.isArray(parseArgument.text.format.schema?.properties?.resistanceLevels?.items)
    ).toBe(false);
  });

  it('対応形式のチャート画像がある場合は input_image を付与する', async () => {
    mockParse.mockResolvedValue({
      output_parsed: {
        priceMovementAnalysis: '当日の値動き分析',
        patternAnalysis: 'パターン分析',
        supportLevels: [100, 99, 98],
        resistanceLevels: [110, 111, 112],
        relatedMarketTrend: '市場動向',
        investmentJudgment: { signal: 'BULLISH', reason: '上昇継続' },
      },
    });

    await generateAiAnalysis('test-api-key', {
      ...testInput,
      chartImageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA',
    });

    expect(mockParse).toHaveBeenCalledWith(
      expect.objectContaining({
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: expect.any(String),
              },
              {
                type: 'input_image',
                image_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA',
                detail: 'auto',
              },
            ],
          },
        ],
      })
    );
  });

  it('非対応形式のチャート画像は input_image に含めない', async () => {
    mockParse.mockResolvedValue({
      output_parsed: {
        priceMovementAnalysis: '当日の値動き分析',
        patternAnalysis: 'パターン分析',
        supportLevels: [100, 99, 98],
        resistanceLevels: [110, 111, 112],
        relatedMarketTrend: '市場動向',
        investmentJudgment: { signal: 'BEARISH', reason: '下落リスク' },
      },
    });

    await generateAiAnalysis('test-api-key', {
      ...testInput,
      chartImageBase64: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    });

    expect(mockParse).toHaveBeenCalledWith(
      expect.objectContaining({
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: expect.any(String),
              },
            ],
          },
        ],
      })
    );
  });

  it('異常系: APIエラー時はErrorをスローする', async () => {
    mockParse.mockRejectedValue(new Error('OpenAI API error'));

    const promise = generateAiAnalysis('test-api-key', testInput);
    const [, error] = await Promise.all([jest.runAllTimersAsync(), promise.catch((err) => err)]);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('OpenAI API error');
    expect(mockParse).toHaveBeenCalledTimes(4);
  });

  it('リトライ: 失敗後の再試行で成功する', async () => {
    mockParse.mockRejectedValueOnce(new Error('temporary error')).mockResolvedValue({
      output_parsed: {
        priceMovementAnalysis: '当日の値動き分析',
        patternAnalysis: 'パターン分析',
        supportLevels: [100, 99, 98],
        resistanceLevels: [110, 111, 112],
        relatedMarketTrend: '市場動向',
        investmentJudgment: { signal: 'NEUTRAL', reason: '様子見' },
      },
    });

    const promise = generateAiAnalysis('test-api-key', testInput);
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result.investmentJudgment.signal).toBe('NEUTRAL');
    expect(mockParse).toHaveBeenCalledTimes(2);
  });

  it('タイムアウト: タイムアウト時はErrorをスローする', async () => {
    mockParse.mockImplementation(() => new Promise(() => undefined));

    const promise = generateAiAnalysis('test-api-key', testInput);
    const [, error] = await Promise.all([jest.runAllTimersAsync(), promise.catch((err) => err)]);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('タイムアウト');
    expect(mockParse).toHaveBeenCalledTimes(4);
  });
});
