import {
  createPocJob,
  getPocDownloadUrl,
  getPocHighlights,
  getPocJob,
  updatePocHighlight,
} from '@/lib/poc-data';

describe('poc-data', () => {
  it('ジョブ作成後、ステータスが PENDING から COMPLETED に進む', () => {
    const job = createPocJob('movie.mp4', 1024);

    const first = getPocJob(job.jobId);
    const second = getPocJob(job.jobId);
    const third = getPocJob(job.jobId);

    expect(first?.status).toBe('PROCESSING');
    expect(second?.status).toBe('PROCESSING');
    expect(third?.status).toBe('COMPLETED');
  });

  it('見どころの採否・時間を更新できる', () => {
    const job = createPocJob('movie.mp4', 2048);
    const highlights = getPocHighlights(job.jobId);

    expect(highlights).not.toBeNull();
    const target = highlights?.[0];
    expect(target).toBeDefined();

    const updated = updatePocHighlight(job.jobId, target!.highlightId, {
      status: 'rejected',
      startSec: 15,
      endSec: 25,
    });

    expect(updated).toMatchObject({
      highlightId: target!.highlightId,
      status: 'rejected',
      startSec: 15,
      endSec: 25,
    });
  });

  it('採用見どころが存在するとダウンロードURLを返す', () => {
    const job = createPocJob('movie.mp4', 4096);

    const downloadUrl = getPocDownloadUrl(job.jobId);

    expect(downloadUrl).toContain('data:application/zip;base64');
  });
});
