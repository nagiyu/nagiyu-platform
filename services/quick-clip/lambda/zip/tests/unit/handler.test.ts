const mockSend = jest.fn();
const mockGetSignedUrl = jest.fn();
const mockMkdir = jest.fn();
const mockWriteFile = jest.fn();
const mockCreateReadStream = jest.fn();

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

jest.mock('node:fs/promises', () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));

jest.mock('node:fs', () => ({
  createReadStream: (...args: unknown[]) => mockCreateReadStream(...args),
}));

describe('zip lambda handler', () => {
  beforeEach(() => {
    process.env.S3_BUCKET = 'bucket';
    process.env.AWS_REGION = 'ap-northeast-1';
    jest.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockCreateReadStream.mockReturnValue('stream');
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

  it('highlightIds が空の場合はエラー', async () => {
    const { handler } = await import('../../src/handler.js');
    await expect(
      handler({
        jobId: 'job-1',
        highlightIds: [],
      })
    ).rejects.toThrow('入力値が不正です');
  });
});
