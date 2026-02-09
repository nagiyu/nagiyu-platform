/**
 * S3 クライアントのテスト
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { S3Client } from '@aws-sdk/client-s3';
import { createS3Client, uploadFile, getS3ObjectUrl } from '../../../src/s3/client.js';

// S3Client のモック
jest.mock('@aws-sdk/client-s3');

describe('S3 Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
