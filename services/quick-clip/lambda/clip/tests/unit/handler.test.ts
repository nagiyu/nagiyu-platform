const mockSend = jest.fn();
const mockUpdate = jest.fn();
const mockSpawn = jest.fn();
const mockGetSignedUrl = jest.fn();
const mockMkdir = jest.fn();
const mockRm = jest.fn();
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

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: class DynamoDBClient {},
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: () => ({}),
  },
}));

jest.mock('@nagiyu/quick-clip-core', () => ({
  DynamoDBHighlightRepository: class DynamoDBHighlightRepository {
    public readonly update = mockUpdate;
  },
}));

jest.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

jest.mock('node:fs/promises', () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  rm: (...args: unknown[]) => mockRm(...args),
}));

jest.mock('node:fs', () => ({
  createReadStream: (...args: unknown[]) => mockCreateReadStream(...args),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));

describe('clip lambda handler', () => {
  const baseEvent = {
    jobId: 'job-1',
    highlightId: 'h-1',
    startSec: 1,
    endSec: 3,
  };

  beforeEach(() => {
    process.env.DYNAMODB_TABLE_NAME = 'jobs';
    process.env.S3_BUCKET = 'bucket';
    process.env.AWS_REGION = 'ap-northeast-1';
    jest.clearAllMocks();

    mockMkdir.mockResolvedValue(undefined);
    mockRm.mockResolvedValue(undefined);
    mockCreateReadStream.mockReturnValue('stream');
    mockGetSignedUrl.mockResolvedValue('https://example.com/input.mp4');

    mockSend.mockResolvedValue({});

    mockSpawn.mockImplementation(() => ({
      stderr: {
        on: jest.fn(),
      },
      on: (event: string, callback: (...args: unknown[]) => void) => {
        if (event === 'close') {
          callback(0);
        }
      },
    }));
  });

  it('正常系ではクリップ作成後にGENERATEDへ更新する', async () => {
    const { handler } = await import('../../src/handler.js');
    const result = await handler(baseEvent);
    expect(result).toEqual({ clipStatus: 'GENERATED' });
    expect(mockUpdate).toHaveBeenCalledWith('job-1', 'h-1', { clipStatus: 'GENERATED' });
  });

  it('異常系ではFAILEDへ更新して例外を送出する', async () => {
    const ffmpegError = new Error('failed');
    mockSpawn.mockImplementation(() => {
      return {
        stderr: {
          on: jest.fn(),
        },
        on: (event: string, callback: (...args: unknown[]) => void) => {
          if (event === 'error') {
            callback(ffmpegError);
          }
        },
      };
    });

    const { handler } = await import('../../src/handler.js');
    await expect(handler(baseEvent)).rejects.toThrow('クリップ分割に失敗しました');
    expect(mockUpdate).toHaveBeenCalledWith('job-1', 'h-1', { clipStatus: 'FAILED' });
  });
});
