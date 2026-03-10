import OpenAI from 'openai';
import { generateAiAnalysis } from '../../../src/lib/openai-client.js';

const mockCreate = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    responses: {
      create: mockCreate,
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
  volume: 2000000,
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
      volume: 1800000,
    },
    {
      date: '2026-03-04',
      open: 100,
      high: 120,
      low: 95,
      close: 110,
      volume: 2000000,
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
    mockCreate.mockResolvedValue({ output_text: '日本語の解析テキスト' });

    const result = await generateAiAnalysis('test-api-key', testInput);

    expect(result).toBe('日本語の解析テキスト');
    expect(OpenAI).toHaveBeenCalledWith({
      apiKey: 'test-api-key',
      maxRetries: 0,
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-5-mini',
        tools: [{ type: 'web_search' }],
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: expect.stringContaining('出来高: 2000000'),
              },
            ],
          },
        ],
      })
    );
    expect(mockCreate.mock.calls[0][0].input[0].content[0].text).toContain(
      '日付, 始値, 高値, 安値, 終値, 出来高'
    );
  });

  it('対応形式のチャート画像がある場合は input_image を付与する', async () => {
    mockCreate.mockResolvedValue({ output_text: '画像付き解析テキスト' });

    await generateAiAnalysis('test-api-key', {
      ...testInput,
      chartImageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA',
    });

    expect(mockCreate).toHaveBeenCalledWith(
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
    mockCreate.mockResolvedValue({ output_text: 'テキスト解析テキスト' });

    await generateAiAnalysis('test-api-key', {
      ...testInput,
      chartImageBase64: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    });

    expect(mockCreate).toHaveBeenCalledWith(
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
    mockCreate.mockRejectedValue(new Error('OpenAI API error'));

    const promise = generateAiAnalysis('test-api-key', testInput);
    const [, error] = await Promise.all([jest.runAllTimersAsync(), promise.catch((err) => err)]);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('OpenAI API error');
    expect(mockCreate).toHaveBeenCalledTimes(4);
  });

  it('リトライ: 失敗後の再試行で成功する', async () => {
    mockCreate.mockRejectedValueOnce(new Error('temporary error')).mockResolvedValue({
      output_text: 'リトライ後に成功',
    });

    const promise = generateAiAnalysis('test-api-key', testInput);
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('リトライ後に成功');
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('タイムアウト: タイムアウト時はErrorをスローする', async () => {
    mockCreate.mockImplementation(() => new Promise(() => undefined));

    const promise = generateAiAnalysis('test-api-key', testInput);
    const [, error] = await Promise.all([jest.runAllTimersAsync(), promise.catch((err) => err)]);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('タイムアウト');
    expect(mockCreate).toHaveBeenCalledTimes(4);
  });
});
