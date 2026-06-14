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

/** JSZip のバッファを展開してエントリ名の一覧を返すヘルパー。 */
async function listZipEntries(buffer: Buffer): Promise<string[]> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buffer);
  return Object.keys(zip.files);
}

/** JSZip のバッファから特定エントリのテキストを取り出すヘルパー。 */
async function readZipEntry(buffer: Buffer, name: string): Promise<string> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buffer);
  const file = zip.file(name);
  if (!file) throw new Error(`エントリが見つかりません: ${name}`);
  return file.async('text');
}

/** 動画バイト列のモックを作成するヘルパー。 */
const makeVideoBody = () => ({
  transformToByteArray: async () => new Uint8Array([1, 2, 3]),
});

/** transcript.json のモックレスポンスボディを作成するヘルパー。 */
const makeTranscriptBody = (segments: Array<{ start: number; end: number; text: string }>) => ({
  transformToByteArray: async () => new Uint8Array(Buffer.from(JSON.stringify(segments))),
  transformToString: async () => JSON.stringify(segments),
});

describe('zip lambda handler', () => {
  beforeEach(() => {
    process.env.S3_BUCKET = 'bucket';
    process.env.AWS_REGION = 'ap-northeast-1';
    jest.clearAllMocks();
    jest.resetModules();
    mockGetSignedUrl.mockResolvedValue('https://example.com/clips.zip');
  });

  // -------------------------------------------------------------------------
  // 基本動作
  // -------------------------------------------------------------------------

  it('クリップをZIP化して署名URLを返す', async () => {
    mockSend.mockImplementation(
      (command: { constructor: { name: string }; input: { Key?: string } }) => {
        const key = (command.input as { Key?: string }).Key ?? '';
        if (command.constructor.name === 'GetObjectCommand') {
          if (key.endsWith('transcript.json')) {
            return Promise.resolve({ Body: makeTranscriptBody([]) });
          }
          return Promise.resolve({ Body: makeVideoBody() });
        }
        return Promise.resolve({});
      }
    );

    const { handler } = await import('../../src/handler.js');
    const result = await handler({
      jobId: 'job-1',
      clips: [
        { highlightId: 'h1', order: 1, startSec: 0, endSec: 10 },
        { highlightId: 'h2', order: 2, startSec: 10, endSec: 20 },
      ],
    });
    expect(result).toEqual({ downloadUrl: 'https://example.com/clips.zip' });
    expect(mockSend).toHaveBeenCalled();
    expect(mockGetSignedUrl).toHaveBeenCalled();
  });

  it('PutObjectCommand に ContentLength が設定される', async () => {
    mockSend.mockImplementation(
      (command: { constructor: { name: string }; input: { Key?: string } }) => {
        const key = (command.input as { Key?: string }).Key ?? '';
        if (command.constructor.name === 'GetObjectCommand') {
          if (key.endsWith('transcript.json')) {
            return Promise.resolve({ Body: makeTranscriptBody([]) });
          }
          return Promise.resolve({ Body: makeVideoBody() });
        }
        return Promise.resolve({});
      }
    );

    const { handler } = await import('../../src/handler.js');
    await handler({
      jobId: 'job-1',
      clips: [{ highlightId: 'h1', order: 1, startSec: 0, endSec: 10 }],
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

  // -------------------------------------------------------------------------
  // validateEvent 異常系
  // -------------------------------------------------------------------------

  it('jobId が空の場合はエラー', async () => {
    const { handler } = await import('../../src/handler.js');
    await expect(
      handler({
        jobId: '',
        clips: [{ highlightId: 'h1', order: 1, startSec: 0, endSec: 10 }],
      })
    ).rejects.toThrow('入力値が不正です');
  });

  it('clips が空配列の場合はエラー', async () => {
    const { handler } = await import('../../src/handler.js');
    await expect(
      handler({
        jobId: 'job-1',
        clips: [],
      })
    ).rejects.toThrow('入力値が不正です');
  });

  it('clips が配列でない場合はエラー', async () => {
    const { handler } = await import('../../src/handler.js');
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handler({ jobId: 'job-1', clips: 'invalid' as any })
    ).rejects.toThrow('入力値が不正です');
  });

  // -------------------------------------------------------------------------
  // クリップ取得失敗
  // -------------------------------------------------------------------------

  it('クリップ取得に失敗した場合は例外を再スローする', async () => {
    mockSend.mockImplementation(
      (command: { constructor: { name: string }; input: { Key?: string } }) => {
        const key = (command.input as { Key?: string }).Key ?? '';
        if (command.constructor.name === 'GetObjectCommand') {
          if (key.endsWith('transcript.json')) {
            const err = Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' });
            return Promise.reject(err);
          }
          return Promise.reject(new Error('S3 get failed'));
        }
        return Promise.resolve({});
      }
    );

    const { handler } = await import('../../src/handler.js');
    await expect(
      handler({
        jobId: 'job-1',
        clips: [{ highlightId: 'h1', order: 1, startSec: 0, endSec: 10 }],
      })
    ).rejects.toThrow('S3 get failed');
  });

  // -------------------------------------------------------------------------
  // order ベースのファイル命名
  // -------------------------------------------------------------------------

  it('zip 内の動画ファイル名が order ベースのゼロ埋め2桁になる（order=1 → clip-01）', async () => {
    mockSend.mockImplementation(
      (command: { constructor: { name: string }; input: { Key?: string } }) => {
        const key = (command.input as { Key?: string }).Key ?? '';
        if (command.constructor.name === 'GetObjectCommand') {
          if (key.endsWith('transcript.json')) {
            return Promise.resolve({ Body: makeTranscriptBody([]) });
          }
          return Promise.resolve({ Body: makeVideoBody() });
        }
        return Promise.resolve({});
      }
    );

    const { handler } = await import('../../src/handler.js');
    await handler({
      jobId: 'job-1',
      clips: [{ highlightId: 'h1', order: 1, startSec: 0, endSec: 10 }],
    });

    // PutObjectCommand の Body から zip エントリを取得して検証
    const putCall = mockSend.mock.calls.find(
      (call: unknown[]) =>
        (call[0] as { constructor: { name: string } }).constructor.name === 'PutObjectCommand'
    );
    const zipBuffer = (putCall![0] as { input: { Body: Buffer } }).input.Body;
    const entries = await listZipEntries(zipBuffer);
    expect(entries).toContain('clip-01.mp4');
  });

  it('order=10 の場合は clip-10 になる', async () => {
    mockSend.mockImplementation(
      (command: { constructor: { name: string }; input: { Key?: string } }) => {
        const key = (command.input as { Key?: string }).Key ?? '';
        if (command.constructor.name === 'GetObjectCommand') {
          if (key.endsWith('transcript.json')) {
            return Promise.resolve({ Body: makeTranscriptBody([]) });
          }
          return Promise.resolve({ Body: makeVideoBody() });
        }
        return Promise.resolve({});
      }
    );

    const { handler } = await import('../../src/handler.js');
    await handler({
      jobId: 'job-1',
      clips: [{ highlightId: 'h1', order: 10, startSec: 0, endSec: 10 }],
    });

    const putCall = mockSend.mock.calls.find(
      (call: unknown[]) =>
        (call[0] as { constructor: { name: string } }).constructor.name === 'PutObjectCommand'
    );
    const zipBuffer = (putCall![0] as { input: { Body: Buffer } }).input.Body;
    const entries = await listZipEntries(zipBuffer);
    expect(entries).toContain('clip-10.mp4');
  });

  // -------------------------------------------------------------------------
  // transcript.json ありのケース
  // -------------------------------------------------------------------------

  it('transcript.json あり: テキストに重なるセグメントがある場合は .txt も同梱される', async () => {
    const segments = [
      { start: 5, end: 15, text: 'こんにちは' },
      { start: 12, end: 18, text: '世界' },
    ];
    mockSend.mockImplementation(
      (command: { constructor: { name: string }; input: { Key?: string } }) => {
        const key = (command.input as { Key?: string }).Key ?? '';
        if (command.constructor.name === 'GetObjectCommand') {
          if (key.endsWith('transcript.json')) {
            return Promise.resolve({ Body: makeTranscriptBody(segments) });
          }
          return Promise.resolve({ Body: makeVideoBody() });
        }
        return Promise.resolve({});
      }
    );

    const { handler } = await import('../../src/handler.js');
    await handler({
      jobId: 'job-1',
      clips: [{ highlightId: 'h1', order: 1, startSec: 10, endSec: 20 }],
    });

    const putCall = mockSend.mock.calls.find(
      (call: unknown[]) =>
        (call[0] as { constructor: { name: string } }).constructor.name === 'PutObjectCommand'
    );
    const zipBuffer = (putCall![0] as { input: { Body: Buffer } }).input.Body;
    const entries = await listZipEntries(zipBuffer);
    expect(entries).toContain('clip-01.mp4');
    expect(entries).toContain('clip-01.txt');
  });

  it('transcript.json あり: テキスト内容は改行で連結される', async () => {
    const segments = [
      { start: 0, end: 12, text: '1行目' },
      { start: 8, end: 20, text: '2行目' },
    ];
    mockSend.mockImplementation(
      (command: { constructor: { name: string }; input: { Key?: string } }) => {
        const key = (command.input as { Key?: string }).Key ?? '';
        if (command.constructor.name === 'GetObjectCommand') {
          if (key.endsWith('transcript.json')) {
            return Promise.resolve({ Body: makeTranscriptBody(segments) });
          }
          return Promise.resolve({ Body: makeVideoBody() });
        }
        return Promise.resolve({});
      }
    );

    const { handler } = await import('../../src/handler.js');
    await handler({
      jobId: 'job-1',
      clips: [{ highlightId: 'h1', order: 3, startSec: 5, endSec: 15 }],
    });

    const putCall = mockSend.mock.calls.find(
      (call: unknown[]) =>
        (call[0] as { constructor: { name: string } }).constructor.name === 'PutObjectCommand'
    );
    const zipBuffer = (putCall![0] as { input: { Body: Buffer } }).input.Body;
    const text = await readZipEntry(zipBuffer, 'clip-03.txt');
    expect(text).toBe('1行目\n2行目');
  });

  it('transcript.json あり: テキストが空のクリップには .txt を含めない', async () => {
    // クリップ範囲 (50, 60) にはセグメントが重ならない
    const segments = [{ start: 0, end: 10, text: 'テキスト' }];
    mockSend.mockImplementation(
      (command: { constructor: { name: string }; input: { Key?: string } }) => {
        const key = (command.input as { Key?: string }).Key ?? '';
        if (command.constructor.name === 'GetObjectCommand') {
          if (key.endsWith('transcript.json')) {
            return Promise.resolve({ Body: makeTranscriptBody(segments) });
          }
          return Promise.resolve({ Body: makeVideoBody() });
        }
        return Promise.resolve({});
      }
    );

    const { handler } = await import('../../src/handler.js');
    await handler({
      jobId: 'job-1',
      clips: [{ highlightId: 'h1', order: 2, startSec: 50, endSec: 60 }],
    });

    const putCall = mockSend.mock.calls.find(
      (call: unknown[]) =>
        (call[0] as { constructor: { name: string } }).constructor.name === 'PutObjectCommand'
    );
    const zipBuffer = (putCall![0] as { input: { Body: Buffer } }).input.Body;
    const entries = await listZipEntries(zipBuffer);
    expect(entries).toContain('clip-02.mp4');
    expect(entries).not.toContain('clip-02.txt');
  });

  it('transcript.json あり: 複数クリップで .txt の有無が正しく分岐する', async () => {
    const segments = [
      { start: 0, end: 15, text: 'テキストA' },
      // clip-02 (30-40) には重ならない
    ];
    mockSend.mockImplementation(
      (command: { constructor: { name: string }; input: { Key?: string } }) => {
        const key = (command.input as { Key?: string }).Key ?? '';
        if (command.constructor.name === 'GetObjectCommand') {
          if (key.endsWith('transcript.json')) {
            return Promise.resolve({ Body: makeTranscriptBody(segments) });
          }
          return Promise.resolve({ Body: makeVideoBody() });
        }
        return Promise.resolve({});
      }
    );

    const { handler } = await import('../../src/handler.js');
    await handler({
      jobId: 'job-1',
      clips: [
        { highlightId: 'h1', order: 1, startSec: 5, endSec: 20 },
        { highlightId: 'h2', order: 2, startSec: 30, endSec: 40 },
      ],
    });

    const putCall = mockSend.mock.calls.find(
      (call: unknown[]) =>
        (call[0] as { constructor: { name: string } }).constructor.name === 'PutObjectCommand'
    );
    const zipBuffer = (putCall![0] as { input: { Body: Buffer } }).input.Body;
    const entries = await listZipEntries(zipBuffer);
    // clip-01 はセグメントあり → .txt 同梱
    expect(entries).toContain('clip-01.mp4');
    expect(entries).toContain('clip-01.txt');
    // clip-02 はセグメントなし → .txt なし
    expect(entries).toContain('clip-02.mp4');
    expect(entries).not.toContain('clip-02.txt');
  });

  // -------------------------------------------------------------------------
  // transcript.json なし（NoSuchKey）のケース
  // -------------------------------------------------------------------------

  it('transcript.json が存在しない場合は .mp4 のみで .txt を一切含めない', async () => {
    mockSend.mockImplementation(
      (command: { constructor: { name: string }; input: { Key?: string } }) => {
        const key = (command.input as { Key?: string }).Key ?? '';
        if (command.constructor.name === 'GetObjectCommand') {
          if (key.endsWith('transcript.json')) {
            const err = Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' });
            return Promise.reject(err);
          }
          return Promise.resolve({ Body: makeVideoBody() });
        }
        return Promise.resolve({});
      }
    );

    const { handler } = await import('../../src/handler.js');
    await handler({
      jobId: 'job-1',
      clips: [
        { highlightId: 'h1', order: 1, startSec: 0, endSec: 10 },
        { highlightId: 'h2', order: 2, startSec: 10, endSec: 20 },
      ],
    });

    const putCall = mockSend.mock.calls.find(
      (call: unknown[]) =>
        (call[0] as { constructor: { name: string } }).constructor.name === 'PutObjectCommand'
    );
    const zipBuffer = (putCall![0] as { input: { Body: Buffer } }).input.Body;
    const entries = await listZipEntries(zipBuffer);
    expect(entries).toContain('clip-01.mp4');
    expect(entries).toContain('clip-02.mp4');
    // .txt は一切含まない
    expect(entries.filter((e) => e.endsWith('.txt'))).toHaveLength(0);
  });

  it('transcript.json の Code: NoSuchKey でも .mp4 のみで処理が続行する', async () => {
    mockSend.mockImplementation(
      (command: { constructor: { name: string }; input: { Key?: string } }) => {
        const key = (command.input as { Key?: string }).Key ?? '';
        if (command.constructor.name === 'GetObjectCommand') {
          if (key.endsWith('transcript.json')) {
            const err = Object.assign(new Error('NoSuchKey'), { Code: 'NoSuchKey' });
            return Promise.reject(err);
          }
          return Promise.resolve({ Body: makeVideoBody() });
        }
        return Promise.resolve({});
      }
    );

    const { handler } = await import('../../src/handler.js');
    const result = await handler({
      jobId: 'job-1',
      clips: [{ highlightId: 'h1', order: 5, startSec: 0, endSec: 10 }],
    });
    expect(result).toEqual({ downloadUrl: 'https://example.com/clips.zip' });

    const putCall = mockSend.mock.calls.find(
      (call: unknown[]) =>
        (call[0] as { constructor: { name: string } }).constructor.name === 'PutObjectCommand'
    );
    const zipBuffer = (putCall![0] as { input: { Body: Buffer } }).input.Body;
    const entries = await listZipEntries(zipBuffer);
    expect(entries).toContain('clip-05.mp4');
    expect(entries.filter((e) => e.endsWith('.txt'))).toHaveLength(0);
  });

  it('transcript.json の取得で想定外エラーが起きた場合は例外を再スローする', async () => {
    mockSend.mockImplementation(
      (command: { constructor: { name: string }; input: { Key?: string } }) => {
        const key = (command.input as { Key?: string }).Key ?? '';
        if (command.constructor.name === 'GetObjectCommand') {
          if (key.endsWith('transcript.json')) {
            return Promise.reject(new Error('AccessDenied'));
          }
          return Promise.resolve({ Body: makeVideoBody() });
        }
        return Promise.resolve({});
      }
    );

    const { handler } = await import('../../src/handler.js');
    await expect(
      handler({
        jobId: 'job-1',
        clips: [{ highlightId: 'h1', order: 1, startSec: 0, endSec: 10 }],
      })
    ).rejects.toThrow('AccessDenied');
  });
});
