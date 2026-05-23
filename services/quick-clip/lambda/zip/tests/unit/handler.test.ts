const mockSend = jest.fn();
const mockGetSignedUrl = jest.fn();

jest.mock('@aws-sdk/client-s3', () => {
  class GetObjectCommand {
    public readonly input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  class PutObjectCommand {
    public readonly input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  class S3Client {
    public send = mockSend;
  }
  return { S3Client, GetObjectCommand, PutObjectCommand };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));

jest.mock('@nagiyu/aws', () => ({
  withErrorReporting: jest.fn((_opts: unknown, fn: () => Promise<unknown>) => fn()),
  getS3Client: jest.fn().mockReturnValue({ send: mockSend }),
}));

jest.mock('@nagiyu/common', () => ({
  requireEnv: jest.fn(() => ({
    S3_BUCKET: 'bucket',
    AWS_REGION: 'ap-northeast-1',
  })),
}));

describe('zip lambda handler', () => {
  beforeEach(() => {
    process.env.S3_BUCKET = 'bucket';
    process.env.AWS_REGION = 'ap-northeast-1';
    jest.clearAllMocks();
    mockGetSignedUrl.mockResolvedValue('https://example.com/clips.zip');
    mockSend.mockImplementation((command: { constructor: { name: string } }) => {
      if (command.constructor.name === 'GetObjectCommand') {
        return Promise.resolve({
          Body: {
            transformToByteArray: async () => new Uint8Array([1, 2, 3]),
          },
        });
      }
      return Promise.resolve({});
    });
  });

  it('クリップをZIP化して署名URLを返す', async () => {
    const { handler } = await import('../../src/handler.js');
    const result = await handler({
      jobId: 'job-1',
      highlightIds: ['h1', 'h2'],
    });
    expect(result).toEqual({ downloadUrl: 'https://example.com/clips.zip' });
    expect(mockSend).toHaveBeenCalled();
    expect(mockGetSignedUrl).toHaveBeenCalled();
  });

  it('PutObjectCommand に ContentLength が設定される', async () => {
    const { handler } = await import('../../src/handler.js');
    await handler({
      jobId: 'job-1',
      highlightIds: ['h1'],
    });
    const putCall = mockSend.mock.calls.find(
      (call: unknown[]) =>
        (call[0] as { constructor: { name: string } }).constructor.name === 'PutObjectCommand'
    );
    expect(putCall).toBeDefined();
    const putCommand = putCall![0] as { input: { ContentLength: number; Body: Buffer } };
    expect(typeof putCommand.input.ContentLength).toBe('number');
    expect(putCommand.input.ContentLength).toBe(putCommand.input.Body.length);
  });

  it('highlightIds が空の場合はエラー', async () => {
    const { handler } = await import('../../src/handler.js');
    await expect(
      handler({
        jobId: 'job-1',
        highlightIds: [],
      })
    ).rejects.toThrow('入力値が不正です');
  });

  it('クリップ取得に失敗した場合は例外を再スローする', async () => {
    mockSend.mockImplementation((command: { constructor: { name: string } }) => {
      if (command.constructor.name === 'GetObjectCommand') {
        return Promise.reject(new Error('S3 get failed'));
      }
      return Promise.resolve({});
    });

    const { handler } = await import('../../src/handler.js');
    await expect(
      handler({
        jobId: 'job-1',
        highlightIds: ['h1'],
      })
    ).rejects.toThrow('S3 get failed');
  });
});
