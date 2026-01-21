import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { getVideoInfo, NiconicoAPIError } from '../../src/niconico/client';

// グローバルfetchをモック化
global.fetch = jest.fn() as any;

describe('getVideoInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch video info successfully', async () => {
    const mockXmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<nicovideo_thumb_response status="ok">
  <thumb>
    <video_id>sm9</video_id>
    <title>新・豪血寺一族 -煩悩解放 - レッツゴー!陰陽師</title>
    <description>レッツゴー!陰陽師（フルコーラスバージョン）</description>
    <thumbnail_url>https://nicovideo.cdn.nimg.jp/thumbnails/9/9</thumbnail_url>
    <first_retrieve>2007-03-06T00:33:00+09:00</first_retrieve>
    <length>5:19</length>
    <view_counter>23000000</view_counter>
    <comment_num>2700000</comment_num>
    <mylist_counter>340000</mylist_counter>
    <tags>
      <tag>音楽</tag>
      <tag lock="1">陰陽師</tag>
      <tag>ニコニコ動画</tag>
    </tags>
  </thumb>
</nicovideo_thumb_response>`;

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: async () => mockXmlResponse,
    });

    const info = await getVideoInfo('sm9');
    
    expect(info.videoId).toBe('sm9');
    expect(info.title).toBe('新・豪血寺一族 -煩悩解放 - レッツゴー!陰陽師');
    expect(info.description).toBe('レッツゴー!陰陽師（フルコーラスバージョン）');
    expect(info.thumbnailUrl).toBe('https://nicovideo.cdn.nimg.jp/thumbnails/9/9');
    expect(info.duration).toBe(319); // 5:19 = 5*60 + 19 = 319秒
    expect(info.viewCount).toBe(23000000);
    expect(info.commentCount).toBe(2700000);
    expect(info.mylistCount).toBe(340000);
    expect(info.uploadedAt).toBe('2007-03-06T00:33:00+09:00');
    expect(info.tags).toEqual(['音楽', '陰陽師', 'ニコニコ動画']);
  });

  it('should throw error for HTTP error', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    await expect(getVideoInfo('invalid_id')).rejects.toThrow(NiconicoAPIError);
    await expect(getVideoInfo('invalid_id')).rejects.toThrow('HTTP error: 404');
  });

  it('should throw error for API error response', async () => {
    const mockXmlError = `<?xml version="1.0" encoding="UTF-8"?>
<nicovideo_thumb_response status="fail">
  <error>
    <code>NOT_FOUND</code>
    <description>動画が見つかりませんでした</description>
  </error>
</nicovideo_thumb_response>`;

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: async () => mockXmlError,
    });

    await expect(getVideoInfo('sm1')).rejects.toThrow(NiconicoAPIError);
    await expect(getVideoInfo('sm1')).rejects.toThrow('動画が見つかりませんでした');
  });

  it('should parse duration correctly for mm:ss format', async () => {
    const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
<nicovideo_thumb_response status="ok">
  <thumb>
    <video_id>test1</video_id>
    <title>Test Video</title>
    <description>Test</description>
    <thumbnail_url>https://example.com/thumb.jpg</thumbnail_url>
    <first_retrieve>2024-01-01T00:00:00+09:00</first_retrieve>
    <length>3:45</length>
    <view_counter>100</view_counter>
    <comment_num>10</comment_num>
    <mylist_counter>5</mylist_counter>
    <tags><tag>test</tag></tags>
  </thumb>
</nicovideo_thumb_response>`;

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: async () => mockXml,
    });

    const info = await getVideoInfo('test1');
    expect(info.duration).toBe(225); // 3*60 + 45 = 225秒
  });

  it('should parse duration correctly for hh:mm:ss format', async () => {
    const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
<nicovideo_thumb_response status="ok">
  <thumb>
    <video_id>test2</video_id>
    <title>Test Video</title>
    <description>Test</description>
    <thumbnail_url>https://example.com/thumb.jpg</thumbnail_url>
    <first_retrieve>2024-01-01T00:00:00+09:00</first_retrieve>
    <length>1:30:45</length>
    <view_counter>100</view_counter>
    <comment_num>10</comment_num>
    <mylist_counter>5</mylist_counter>
    <tags><tag>test</tag></tags>
  </thumb>
</nicovideo_thumb_response>`;

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: async () => mockXml,
    });

    const info = await getVideoInfo('test2');
    expect(info.duration).toBe(5445); // 1*3600 + 30*60 + 45 = 5445秒
  });

  it('should handle videos without tags', async () => {
    const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
<nicovideo_thumb_response status="ok">
  <thumb>
    <video_id>test3</video_id>
    <title>Test Video</title>
    <description>Test</description>
    <thumbnail_url>https://example.com/thumb.jpg</thumbnail_url>
    <first_retrieve>2024-01-01T00:00:00+09:00</first_retrieve>
    <length>5:00</length>
    <view_counter>100</view_counter>
    <comment_num>10</comment_num>
    <mylist_counter>5</mylist_counter>
  </thumb>
</nicovideo_thumb_response>`;

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: async () => mockXml,
    });

    const info = await getVideoInfo('test3');
    expect(info.tags).toEqual([]);
  });

  it('should handle fetch errors', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    await expect(getVideoInfo('test')).rejects.toThrow(NiconicoAPIError);
    await expect(getVideoInfo('test')).rejects.toThrow('Failed to fetch video info: Network error');
  });
});
