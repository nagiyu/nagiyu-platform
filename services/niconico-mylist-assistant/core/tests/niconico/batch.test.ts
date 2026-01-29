import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { getVideoInfoBatch } from '../../src/niconico/batch';
import * as client from '../../src/niconico/client';

describe('getVideoInfoBatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch multiple videos successfully', async () => {
    const mockGetVideoInfo = jest.spyOn(client, 'getVideoInfo').mockImplementation(async (videoId: string) => {
      return {
        videoId,
        title: `Title for ${videoId}`,
        description: 'Test description',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        duration: 300,
        viewCount: 1000,
        commentCount: 100,
        mylistCount: 50,
        uploadedAt: '2024-01-01T00:00:00+09:00',
        tags: ['test'],
      };
    });

    const result = await getVideoInfoBatch(['sm1', 'sm2', 'sm3']);

    expect(result.success).toHaveLength(3);
    expect(result.failed).toHaveLength(0);
    expect(result.success[0].videoId).toBe('sm1');
    expect(result.success[1].videoId).toBe('sm2');
    expect(result.success[2].videoId).toBe('sm3');
    
    mockGetVideoInfo.mockRestore();
  });

  it('should handle partial failures', async () => {
    const mockGetVideoInfo = jest.spyOn(client, 'getVideoInfo').mockImplementation(async (videoId: string) => {
      if (videoId === 'sm2') {
        throw new client.NiconicoAPIError('動画が見つかりませんでした', 'NOT_FOUND', videoId);
      }
      return {
        videoId,
        title: `Title for ${videoId}`,
        description: 'Test description',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        duration: 300,
        viewCount: 1000,
        commentCount: 100,
        mylistCount: 50,
        uploadedAt: '2024-01-01T00:00:00+09:00',
        tags: ['test'],
      };
    });

    const result = await getVideoInfoBatch(['sm1', 'sm2', 'sm3']);

    expect(result.success).toHaveLength(2);
    expect(result.failed).toHaveLength(1);
    expect(result.success[0].videoId).toBe('sm1');
    expect(result.success[1].videoId).toBe('sm3');
    expect(result.failed[0].videoId).toBe('sm2');
    expect(result.failed[0].error).toBe('動画が見つかりませんでした');
    
    mockGetVideoInfo.mockRestore();
  });

  it('should respect concurrency limit', async () => {
    let concurrentCalls = 0;
    let maxConcurrentCalls = 0;

    const mockGetVideoInfo = jest.spyOn(client, 'getVideoInfo').mockImplementation(async (videoId: string) => {
      concurrentCalls++;
      maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);
      
      await new Promise((resolve) => setTimeout(resolve, 10));
      
      concurrentCalls--;
      return {
        videoId,
        title: `Title for ${videoId}`,
        description: 'Test description',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        duration: 300,
        viewCount: 1000,
        commentCount: 100,
        mylistCount: 50,
        uploadedAt: '2024-01-01T00:00:00+09:00',
        tags: ['test'],
      };
    });

    await getVideoInfoBatch(['sm1', 'sm2', 'sm3', 'sm4', 'sm5', 'sm6'], { concurrency: 2 });

    expect(maxConcurrentCalls).toBeLessThanOrEqual(2);
    
    mockGetVideoInfo.mockRestore();
  });

  it('should call progress callback', async () => {
    const onProgress = jest.fn();
    
    const mockGetVideoInfo = jest.spyOn(client, 'getVideoInfo').mockImplementation(async (videoId: string) => {
      return {
        videoId,
        title: `Title for ${videoId}`,
        description: 'Test description',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        duration: 300,
        viewCount: 1000,
        commentCount: 100,
        mylistCount: 50,
        uploadedAt: '2024-01-01T00:00:00+09:00',
        tags: ['test'],
      };
    });

    await getVideoInfoBatch(['sm1', 'sm2', 'sm3', 'sm4', 'sm5'], { 
      concurrency: 2,
      onProgress 
    });

    expect(onProgress).toHaveBeenCalled();
    // 最後の呼び出しは全件完了を示す
    expect(onProgress).toHaveBeenLastCalledWith(5, 5);
    
    mockGetVideoInfo.mockRestore();
  });

  it('should handle unknown errors', async () => {
    const mockGetVideoInfo = jest.spyOn(client, 'getVideoInfo').mockImplementation(async (videoId: string) => {
      if (videoId === 'sm2') {
        throw new Error('Some unknown error');
      }
      return {
        videoId,
        title: `Title for ${videoId}`,
        description: 'Test description',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        duration: 300,
        viewCount: 1000,
        commentCount: 100,
        mylistCount: 50,
        uploadedAt: '2024-01-01T00:00:00+09:00',
        tags: ['test'],
      };
    });

    const result = await getVideoInfoBatch(['sm1', 'sm2', 'sm3']);

    expect(result.success).toHaveLength(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].videoId).toBe('sm2');
    expect(result.failed[0].error).toBe('不明なエラーが発生しました');
    
    mockGetVideoInfo.mockRestore();
  });
});
