import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { extractVideoIdsFromHtml, searchVideos } from '../../src/niconico/search';
import * as batch from '../../src/niconico/batch';
import { NiconicoAPIError } from '../../src/niconico/client';

describe('extractVideoIdsFromHtml', () => {
  it('should extract and deduplicate video IDs', () => {
    const html = '<a href="/watch/sm9">sm9</a><a href="/watch/nm123">nm123</a><span>sm9</span>';
    expect(extractVideoIdsFromHtml(html)).toEqual(['sm9', 'nm123']);
  });

  it('should return empty array when no video IDs are included', () => {
    expect(extractVideoIdsFromHtml('<html><body>No videos</body></html>')).toEqual([]);
  });
});

describe('searchVideos', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.clearAllMocks();
  });

  it('should search HTML and return fetched video infos', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => '<a href="/watch/sm9">sm9</a><a href="/watch/so123">so123</a>',
    } as Response);

    const batchSpy = jest.spyOn(batch, 'getVideoInfoBatch').mockResolvedValueOnce({
      success: [
        {
          videoId: 'sm9',
          title: 'title',
          description: 'description',
          thumbnailUrl: 'https://example.com/thumb.jpg',
          duration: 120,
          viewCount: 1,
          commentCount: 1,
          mylistCount: 1,
          uploadedAt: '2020-01-01T00:00:00+09:00',
          tags: [],
        },
      ],
      failed: [{ videoId: 'so123', error: 'not found' }],
    });

    const result = await searchVideos('テスト');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.nicovideo.jp/search/%E3%83%86%E3%82%B9%E3%83%88'
    );
    expect(batchSpy).toHaveBeenCalledWith(['sm9', 'so123']);
    expect(result).toHaveLength(1);
    expect(result[0].videoId).toBe('sm9');
  });

  it('should throw when keyword is empty', async () => {
    await expect(searchVideos('   ')).rejects.toBeInstanceOf(NiconicoAPIError);
  });

  it('should throw when search endpoint returns non-200 response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    await expect(searchVideos('test')).rejects.toThrow('動画検索に失敗しました: 500');
  });
});
