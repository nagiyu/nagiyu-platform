import { EmotionHighlightService } from '../../../src/libs/emotion-highlight.service.js';
import type { TranscriptSegment } from '../../../src/libs/transcription.service.js';

const mockParse = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    responses: {
      parse: mockParse,
    },
  })),
}));

const mockClient = {
  responses: {
    parse: mockParse,
  },
} as never;

const testSegments: TranscriptSegment[] = [
  { start: 0.0, end: 5.0, text: 'やばい！これは面白すぎるwww' },
  { start: 5.3, end: 10.0, text: 'マジで？どういうことだよ' },
];

const makeSegments = (count: number): TranscriptSegment[] =>
  Array.from({ length: count }, (_, i) => ({
    start: i * 5.0,
    end: i * 5.0 + 4.9,
    text: `セグメント${i + 1}`,
  }));

const mockOutputItems = [
  { second: 0.0, laugh: 0.9, excite: 0.5, touch: 0.1, tension: 0.2 },
  { second: 5.3, laugh: 0.2, excite: 0.8, touch: 0.3, tension: 0.7 },
];

describe('EmotionHighlightService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('正常系: filter=any のとき各行の max スコアと dominantEmotion を返す', async () => {
    mockParse.mockResolvedValue({ output_parsed: { items: mockOutputItems } });

    const service = new EmotionHighlightService(mockClient);
    const promise = service.getScores(testSegments, 'any');
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual([
      { second: 0.0, score: 0.9, dominantEmotion: 'laugh' },
      { second: 5.3, score: 0.8, dominantEmotion: 'excite' },
    ]);
  });

  it('filter=laugh のとき laugh スコアのみ使用する', async () => {
    mockParse.mockResolvedValue({ output_parsed: { items: mockOutputItems } });

    const service = new EmotionHighlightService(mockClient);
    const promise = service.getScores(testSegments, 'laugh');
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result[0].score).toBe(0.9);
    expect(result[1].score).toBe(0.2);
  });

  it('filter=excite のとき excite スコアのみ使用する', async () => {
    mockParse.mockResolvedValue({ output_parsed: { items: mockOutputItems } });

    const service = new EmotionHighlightService(mockClient);
    const promise = service.getScores(testSegments, 'excite');
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result[0].score).toBe(0.5);
    expect(result[1].score).toBe(0.8);
  });

  it('filter=touch のとき touch スコアのみ使用する', async () => {
    mockParse.mockResolvedValue({ output_parsed: { items: mockOutputItems } });

    const service = new EmotionHighlightService(mockClient);
    const promise = service.getScores(testSegments, 'touch');
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result[0].score).toBe(0.1);
    expect(result[1].score).toBe(0.3);
  });

  it('filter=tension のとき tension スコアのみ使用する', async () => {
    mockParse.mockResolvedValue({ output_parsed: { items: mockOutputItems } });

    const service = new EmotionHighlightService(mockClient);
    const promise = service.getScores(testSegments, 'tension');
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result[0].score).toBe(0.2);
    expect(result[1].score).toBe(0.7);
  });

  it('output_parsed が null の場合は空配列を返す', async () => {
    mockParse.mockResolvedValue({ output_parsed: null });

    const service = new EmotionHighlightService(mockClient);
    const promise = service.getScores(testSegments, 'any');
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual([]);
  });

  it('dominantEmotion は filter に関係なく4カテゴリの最大値のラベルを返す', async () => {
    mockParse.mockResolvedValue({
      output_parsed: {
        items: [{ second: 0.0, laugh: 0.1, excite: 0.2, touch: 0.9, tension: 0.3 }],
      },
    });

    const service = new EmotionHighlightService(mockClient);
    const promise = service.getScores(testSegments, 'laugh');
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result[0].dominantEmotion).toBe('touch');
  });

  it('異常系: APIエラー時は3回リトライしてエラーをスローする', async () => {
    mockParse.mockRejectedValue(new Error('API error'));

    const service = new EmotionHighlightService(mockClient);
    const promise = service.getScores(testSegments, 'any');
    const [, error] = await Promise.all([jest.runAllTimersAsync(), promise.catch((e) => e)]);

    expect(error).toBeInstanceOf(Error);
    expect(mockParse).toHaveBeenCalledTimes(4);
  });

  it('タイムアウト時はリトライせずにエラーをスローする', async () => {
    mockParse.mockImplementation(() => new Promise(() => undefined));

    const service = new EmotionHighlightService(mockClient);
    const promise = service.getScores(testSegments, 'any');
    const [, error] = await Promise.all([jest.runAllTimersAsync(), promise.catch((e) => e)]);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('タイムアウト');
    expect(mockParse).toHaveBeenCalledTimes(1);
  });

  it('リトライ: 1回目失敗後の2回目で成功する', async () => {
    mockParse
      .mockRejectedValueOnce(new Error('一時的なエラー'))
      .mockResolvedValue({ output_parsed: { items: mockOutputItems } });

    const service = new EmotionHighlightService(mockClient);
    const promise = service.getScores(testSegments, 'any');
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toHaveLength(2);
    expect(mockParse).toHaveBeenCalledTimes(2);
  });

  it('Responses API に正しいモデル・プロンプトで呼び出される', async () => {
    mockParse.mockResolvedValue({ output_parsed: { items: [] } });

    const service = new EmotionHighlightService(mockClient);
    const promise = service.getScores(testSegments, 'any');
    await jest.runAllTimersAsync();
    await promise;

    expect(mockParse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-5-mini',
        stream: false,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: expect.stringContaining('[0.0] やばい！これは面白すぎるwww'),
              },
            ],
          },
        ],
      })
    );
  });

  it('チャンク境界: 50件のセグメントでは mockParse が1回だけ呼ばれる', async () => {
    mockParse.mockResolvedValue({ output_parsed: { items: [] } });

    const service = new EmotionHighlightService(mockClient);
    const promise = service.getScores(makeSegments(50), 'any');
    await jest.runAllTimersAsync();
    await promise;

    expect(mockParse).toHaveBeenCalledTimes(1);
  });

  it('チャンク境界: 51件のセグメントでは mockParse が2回呼ばれ、結果が結合される', async () => {
    const chunk1Items = [{ second: 0.0, laugh: 0.9, excite: 0.5, touch: 0.1, tension: 0.2 }];
    const chunk2Items = [{ second: 250.0, laugh: 0.2, excite: 0.8, touch: 0.3, tension: 0.7 }];
    mockParse
      .mockResolvedValueOnce({ output_parsed: { items: chunk1Items } })
      .mockResolvedValueOnce({ output_parsed: { items: chunk2Items } });

    const service = new EmotionHighlightService(mockClient);
    const promise = service.getScores(makeSegments(51), 'any');
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(mockParse).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
    expect(result[0].second).toBe(0.0);
    expect(result[1].second).toBe(250.0);
  });

  it('チャンク内リトライ: 1チャンク目が1回失敗後に成功する', async () => {
    mockParse
      .mockRejectedValueOnce(new Error('一時的なエラー'))
      .mockResolvedValue({ output_parsed: { items: mockOutputItems } });

    const service = new EmotionHighlightService(mockClient);
    const promise = service.getScores(makeSegments(50), 'any');
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(mockParse).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
  });

  it('並列化: 4チャンク（EMOTION_SCORING_CONCURRENCY=3）でも全チャンクの結果が順序通り結合される', async () => {
    const segmentsPerChunk = 50;
    const makeItems = (second: number) => [
      { second, laugh: 0.1, excite: 0.2, touch: 0.3, tension: 0.4 },
    ];
    mockParse
      .mockResolvedValueOnce({ output_parsed: { items: makeItems(0.0) } })
      .mockResolvedValueOnce({ output_parsed: { items: makeItems(50.0) } })
      .mockResolvedValueOnce({ output_parsed: { items: makeItems(100.0) } })
      .mockResolvedValueOnce({ output_parsed: { items: makeItems(150.0) } });

    const service = new EmotionHighlightService(mockClient);
    const promise = service.getScores(makeSegments(4 * segmentsPerChunk), 'any');
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(mockParse).toHaveBeenCalledTimes(4);
    expect(result).toHaveLength(4);
    expect(result[0].second).toBe(0.0);
    expect(result[1].second).toBe(50.0);
    expect(result[2].second).toBe(100.0);
    expect(result[3].second).toBe(150.0);
  });

  it('onProgress: 複数チャンクのとき各チャンク完了後に onProgress が呼ばれる', async () => {
    const chunk1Items = [{ second: 0.0, laugh: 0.9, excite: 0.5, touch: 0.1, tension: 0.2 }];
    const chunk2Items = [{ second: 250.0, laugh: 0.2, excite: 0.8, touch: 0.3, tension: 0.7 }];
    mockParse
      .mockResolvedValueOnce({ output_parsed: { items: chunk1Items } })
      .mockResolvedValueOnce({ output_parsed: { items: chunk2Items } });

    const onProgress = jest.fn().mockResolvedValue(undefined);
    const service = new EmotionHighlightService(mockClient);
    const promise = service.getScores(makeSegments(51), 'any', onProgress);
    await jest.runAllTimersAsync();
    await promise;

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenCalledWith(1, 2);
    expect(onProgress).toHaveBeenCalledWith(2, 2);
  });

  it('onProgress: チャンクが1つのとき onProgress は呼ばれない', async () => {
    mockParse.mockResolvedValue({ output_parsed: { items: mockOutputItems } });

    const onProgress = jest.fn().mockResolvedValue(undefined);
    const service = new EmotionHighlightService(mockClient);
    const promise = service.getScores(testSegments, 'any', onProgress);
    await jest.runAllTimersAsync();
    await promise;

    expect(onProgress).not.toHaveBeenCalled();
  });
});
