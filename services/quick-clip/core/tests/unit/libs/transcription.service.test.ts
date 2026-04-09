import { TranscriptionService } from '../../../src/libs/transcription.service.js';

const mockCreate = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    audio: {
      transcriptions: {
        create: mockCreate,
      },
    },
  })),
}));

jest.mock('node:fs', () => ({
  createReadStream: jest.fn(() => 'mock-stream'),
}));

const mockClient = {
  audio: {
    transcriptions: {
      create: mockCreate,
    },
  },
} as never;

describe('TranscriptionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('正常系: セグメント付きレスポンスを TranscriptSegment[] に変換する', async () => {
    mockCreate.mockResolvedValue({
      text: 'やばい！これは面白すぎるwww',
      segments: [
        { start: 0.0, end: 5.0, text: 'やばい！これは面白すぎるwww' },
        { start: 5.3, end: 10.0, text: 'マジで？どういうことだよ' },
      ],
    });

    const service = new TranscriptionService(mockClient);
    const result = await service.transcribe('/tmp/test.mp4');

    expect(result).toEqual([
      { start: 0.0, end: 5.0, text: 'やばい！これは面白すぎるwww' },
      { start: 5.3, end: 10.0, text: 'マジで？どういうことだよ' },
    ]);
  });

  it('segments が undefined の場合は空配列を返す', async () => {
    mockCreate.mockResolvedValue({
      text: '',
    });

    const service = new TranscriptionService(mockClient);
    const result = await service.transcribe('/tmp/test.mp4');

    expect(result).toEqual([]);
  });

  it('segments が空配列の場合は空配列を返す', async () => {
    mockCreate.mockResolvedValue({
      text: '',
      segments: [],
    });

    const service = new TranscriptionService(mockClient);
    const result = await service.transcribe('/tmp/test.mp4');

    expect(result).toEqual([]);
  });

  it('API エラー時は例外をそのままスローする', async () => {
    mockCreate.mockRejectedValue(new Error('OpenAI API error'));

    const service = new TranscriptionService(mockClient);

    await expect(service.transcribe('/tmp/test.mp4')).rejects.toThrow('OpenAI API error');
  });

  it('正しいパラメータで API が呼ばれる', async () => {
    mockCreate.mockResolvedValue({ text: '', segments: [] });

    const service = new TranscriptionService(mockClient);
    await service.transcribe('/tmp/video.mp4');

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o-mini-transcribe',
        response_format: 'verbose_json',
        language: 'ja',
      })
    );
  });
});
