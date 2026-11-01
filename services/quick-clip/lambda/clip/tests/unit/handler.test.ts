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
  createHighlightRepository: jest.fn(() => ({ update: mockUpdate })),
}));

jest.mock('@nagiyu/aws', () => ({
  withErrorReporting: jest.fn((_opts: unknown, fn: () => Promise<unknown>) => fn()),
  getDynamoDBDocumentClient: jest.fn().mockReturnValue({}),
  getS3Client: jest.fn().mockReturnValue({ send: mockSend }),
  createPresignedDownloadUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));

jest.mock('@nagiyu/common', () => ({
  requireEnv: jest.fn(() => ({
    DYNAMODB_TABLE_NAME: 'jobs',
    S3_BUCKET: 'bucket',
    AWS_REGION: 'ap-northeast-1',
  })),
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

    // withErrorReporting の onError まで呼び出す実装にする
    const { withErrorReporting } = await import('@nagiyu/aws');
    (withErrorReporting as jest.Mock).mockImplementation(
      async (opts: { onError?: (e: unknown) => Promise<void> }, fn: () => Promise<unknown>) => {
        try {
          return await fn();
        } catch (error) {
          if (opts.onError) await opts.onError(error);
          throw error;
        }
      }
    );

    const { handler } = await import('../../src/handler.js');
    await expect(handler(baseEvent)).rejects.toThrow('クリップ分割に失敗しました');
    expect(mockUpdate).toHaveBeenCalledWith('job-1', 'h-1', { clipStatus: 'FAILED' });
  });

  it('正常系では withErrorReporting の onError を呼ばない', async () => {
    const { handler } = await import('../../src/handler.js');
    await handler(baseEvent);
    expect(mockUpdate).not.toHaveBeenCalledWith('job-1', 'h-1', { clipStatus: 'FAILED' });
  });

  describe('入力検証', () => {
    it.each([
      ['jobId が空', { jobId: '' }],
      ['highlightId が空', { highlightId: '' }],
      ['startSec が数値でない', { startSec: '1' }],
      ['endSec が数値でない', { endSec: undefined }],
      ['startSec が負数', { startSec: -1 }],
      ['endSec が startSec と同じ', { startSec: 3, endSec: 3 }],
      ['endSec が startSec より前', { startSec: 5, endSec: 3 }],
    ])('%s の場合は副作用を起こさず入力不正で失敗する', async (_label, override) => {
      const { handler } = await import('../../src/handler.js');
      await expect(handler({ ...baseEvent, ...override } as typeof baseEvent)).rejects.toThrow(
        '入力値が不正です'
      );
      expect(mockSpawn).not.toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  it('ffmpeg が非0で終了した場合は終了コードと stderr を含むエラーでFAILEDへ更新する', async () => {
    mockSpawn.mockImplementation(() => {
      let onData: (chunk: Buffer) => void = () => undefined;
      return {
        stderr: {
          on: (event: string, callback: (chunk: Buffer) => void) => {
            if (event === 'data') onData = callback;
          },
        },
        on: (event: string, callback: (...args: unknown[]) => void) => {
          if (event === 'close') {
            onData(Buffer.from('Invalid data found'));
            callback(1);
          }
        },
      };
    });

    const { withErrorReporting } = await import('@nagiyu/aws');
    (withErrorReporting as jest.Mock).mockImplementation(
      async (opts: { onError?: (e: unknown) => Promise<void> }, fn: () => Promise<unknown>) => {
        try {
          return await fn();
        } catch (error) {
          if (opts.onError) await opts.onError(error);
          throw error;
        }
      }
    );

    const { handler } = await import('../../src/handler.js');
    await expect(handler(baseEvent)).rejects.toThrow(
      'クリップ分割に失敗しました: exit code 1, stderr: Invalid data found'
    );
    expect(mockUpdate).toHaveBeenCalledWith('job-1', 'h-1', { clipStatus: 'FAILED' });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('失敗時も作業ディレクトリを削除する', async () => {
    mockSpawn.mockImplementation(() => ({
      stderr: { on: jest.fn() },
      on: (event: string, callback: (...args: unknown[]) => void) => {
        if (event === 'error') callback(new Error('spawn ffmpeg ENOENT'));
      },
    }));

    const { handler } = await import('../../src/handler.js');
    await expect(handler(baseEvent)).rejects.toThrow('クリップ分割に失敗しました');
    expect(mockRm).toHaveBeenCalledWith(expect.stringContaining('job-1'), {
      recursive: true,
      force: true,
    });
  });
});
