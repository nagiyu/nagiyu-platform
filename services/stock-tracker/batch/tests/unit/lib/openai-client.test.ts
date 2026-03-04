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
  buyPatternCount: 2,
  sellPatternCount: 1,
  patternSummary: 'ゴールデンクロス, RSI買いシグナル',
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
