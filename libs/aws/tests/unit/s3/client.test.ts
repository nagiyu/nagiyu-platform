/**
 * S3 クライアントのテスト
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  clearS3ClientCache,
  createS3Client,
  getS3Client,
  uploadFile,
  getS3ObjectUrl,
  createPresignedUploadUrl,
  createPresignedDownloadUrl,
} from '../../../src/s3/client.js';

// S3Client のモック
jest.mock('@aws-sdk/client-s3');

// getSignedUrl のモック
jest.mock('@aws-sdk/s3-request-presigner');

describe('S3 Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearS3ClientCache();
  });

  describe('createS3Client', () => {
    it('should create S3 client with default region', () => {
      const client = createS3Client();
      expect(client).toBeInstanceOf(S3Client);
    });

    it('should create S3 client with specified region', () => {
      const client = createS3Client({ region: 'ap-northeast-1' });
      expect(client).toBeInstanceOf(S3Client);
    });
  });

  describe('uploadFile', () => {
    it('should upload file to S3', async () => {
      const mockSend = jest.fn().mockResolvedValue({ ETag: '"mock-etag"' });
      const mockClient = {
        send: mockSend,
      } as unknown as S3Client;

      const result = await uploadFile(mockClient, {
        bucketName: 'test-bucket',
        key: 'test-key.png',
        body: Buffer.from('test data'),
        contentType: 'image/png',
      });

      expect(result).toBe('"mock-etag"');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should upload file with metadata', async () => {
      const mockSend = jest.fn().mockResolvedValue({ ETag: '"mock-etag"' });
      const mockClient = {
        send: mockSend,
      } as unknown as S3Client;

      await uploadFile(mockClient, {
        bucketName: 'test-bucket',
        key: 'test-key.png',
        body: Buffer.from('test data'),
        contentType: 'image/png',
        metadata: {
          originalFilename: 'test.png',
          timestamp: '2024-01-01',
        },
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('createS3Client - AWS_REGION フォールバック', () => {
    it('AWS_REGION 環境変数が設定されている場合はそれを使う', () => {
      process.env.AWS_REGION = 'eu-west-1';
      try {
        const client = createS3Client();
        expect(client).toBeInstanceOf(S3Client);
      } finally {
        delete process.env.AWS_REGION;
      }
    });
  });

  describe('getS3Client', () => {
    it('AWS_REGION 環境変数が設定されている場合はそれをデフォルトリージョンとして使う', () => {
      process.env.AWS_REGION = 'ap-northeast-1';
      try {
        const client = getS3Client();
        expect(client).toBeInstanceOf(S3Client);
      } finally {
        delete process.env.AWS_REGION;
        clearS3ClientCache();
      }
    });

    it('同一リージョンではシングルトンを返す', () => {
      const first = getS3Client('ap-northeast-1');
      const second = getS3Client('ap-northeast-1');

      expect(first).toBe(second);
    });

    it('リージョンが異なる場合は別インスタンスを返す', () => {
      const first = getS3Client('ap-northeast-1');
      const second = getS3Client('us-east-1');

      expect(first).not.toBe(second);
    });

    it('キャッシュクリア後は新しいインスタンスを返す', () => {
      const first = getS3Client('ap-northeast-1');
      clearS3ClientCache();
      const second = getS3Client('ap-northeast-1');

      expect(first).not.toBe(second);
    });
  });

  describe('createPresignedUploadUrl', () => {
    it('指定した client で PutObjectCommand の Presigned URL を生成する', async () => {
      const mockedGetSignedUrl = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>;
      mockedGetSignedUrl.mockResolvedValue('https://example.com/upload-url');
      const mockClient = {} as unknown as S3Client;

      const url = await createPresignedUploadUrl(
        {
          bucketName: 'test-bucket',
          key: 'uploads/test-key.mp4',
          contentType: 'video/mp4',
          expiresIn: 3600,
        },
        mockClient
      );

      expect(url).toBe('https://example.com/upload-url');
      expect(mockedGetSignedUrl).toHaveBeenCalledTimes(1);
      expect(mockedGetSignedUrl).toHaveBeenCalledWith(mockClient, expect.any(PutObjectCommand), {
        expiresIn: 3600,
      });

      const MockedPutObjectCommand = PutObjectCommand as jest.MockedClass<typeof PutObjectCommand>;
      expect(MockedPutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'uploads/test-key.mp4',
        ContentType: 'video/mp4',
      });
    });

    it('contentType を省略できる', async () => {
      const mockedGetSignedUrl = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>;
      mockedGetSignedUrl.mockResolvedValue('https://example.com/upload-url');
      const mockClient = {} as unknown as S3Client;

      await createPresignedUploadUrl(
        {
          bucketName: 'test-bucket',
          key: 'uploads/test-key.mp4',
          expiresIn: 60,
        },
        mockClient
      );

      const MockedPutObjectCommand = PutObjectCommand as jest.MockedClass<typeof PutObjectCommand>;
      expect(MockedPutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'uploads/test-key.mp4',
        ContentType: undefined,
      });
    });

    it('client 省略時は getS3Client() を使用する', async () => {
      const mockedGetSignedUrl = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>;
      mockedGetSignedUrl.mockResolvedValue('https://example.com/upload-url');

      await createPresignedUploadUrl({
        bucketName: 'test-bucket',
        key: 'uploads/test-key.mp4',
        expiresIn: 3600,
      });

      const clientArg = mockedGetSignedUrl.mock.calls[0][0];
      expect(clientArg).toBeInstanceOf(S3Client);
    });
  });

  describe('createPresignedDownloadUrl', () => {
    it('指定した client で GetObjectCommand の Presigned URL を生成する', async () => {
      const mockedGetSignedUrl = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>;
      mockedGetSignedUrl.mockResolvedValue('https://example.com/download-url');
      const mockClient = {} as unknown as S3Client;

      const url = await createPresignedDownloadUrl(
        {
          bucketName: 'test-bucket',
          key: 'outputs/test-key.mp4',
          expiresIn: 86400,
        },
        mockClient
      );

      expect(url).toBe('https://example.com/download-url');
      expect(mockedGetSignedUrl).toHaveBeenCalledTimes(1);
      expect(mockedGetSignedUrl).toHaveBeenCalledWith(mockClient, expect.any(GetObjectCommand), {
        expiresIn: 86400,
      });

      const MockedGetObjectCommand = GetObjectCommand as jest.MockedClass<typeof GetObjectCommand>;
      expect(MockedGetObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'outputs/test-key.mp4',
      });
    });

    it('client 省略時は getS3Client() を使用する', async () => {
      const mockedGetSignedUrl = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>;
      mockedGetSignedUrl.mockResolvedValue('https://example.com/download-url');

      await createPresignedDownloadUrl({
        bucketName: 'test-bucket',
        key: 'outputs/test-key.mp4',
        expiresIn: 300,
      });

      const clientArg = mockedGetSignedUrl.mock.calls[0][0];
      expect(clientArg).toBeInstanceOf(S3Client);
    });
  });

  describe('getS3ObjectUrl', () => {
    it('should generate correct S3 URL with default region', () => {
      const url = getS3ObjectUrl('test-bucket', 'test-key.png');
      expect(url).toBe('https://test-bucket.s3.us-east-1.amazonaws.com/test-key.png');
    });

    it('should generate correct S3 URL with specified region', () => {
      const url = getS3ObjectUrl('test-bucket', 'test-key.png', 'ap-northeast-1');
      expect(url).toBe('https://test-bucket.s3.ap-northeast-1.amazonaws.com/test-key.png');
    });

    it('should handle keys with special characters', () => {
      const url = getS3ObjectUrl('test-bucket', 'screenshots/2024-01-01-test.png', 'us-east-1');
      expect(url).toBe(
        'https://test-bucket.s3.us-east-1.amazonaws.com/screenshots/2024-01-01-test.png'
      );
    });
  });
});
