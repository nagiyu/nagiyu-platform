import { JobService } from '../../../src/libs/job.service.js';
import type { JobRepository } from '../../../src/repositories/job.repository.interface.js';
import type { Job } from '../../../src/types.js';

const createJobRepositoryMock = (): jest.Mocked<JobRepository> => ({
  getById: jest.fn(),
  create: jest.fn(),
  updateStatus: jest.fn(),
});

describe('JobService', () => {
  it('ジョブを作成してリポジトリに保存する', async () => {
    const repository = createJobRepositoryMock();
    const service = new JobService(repository);

    repository.create.mockImplementation(async (job) => job);

    const result = await service.createJob({
      originalFileName: ' movie.mp4 ',
      fileSize: 1024,
    });

    expect(repository.create).toHaveBeenCalledTimes(1);
    const createdJob = repository.create.mock.calls[0][0] as Job;
    expect(createdJob.originalFileName).toBe('movie.mp4');
    expect(createdJob.status).toBe('PENDING');
    expect(createdJob.fileSize).toBe(1024);
    expect(createdJob.expiresAt).toBe(createdJob.createdAt + 24 * 60 * 60);

    expect(result).toEqual(createdJob);
  });

  it('ファイル名が空の場合はエラー', async () => {
    const repository = createJobRepositoryMock();
    const service = new JobService(repository);

    await expect(
      service.createJob({
        originalFileName: '   ',
        fileSize: 100,
      })
    ).rejects.toThrow('ファイル名は必須です');
  });

  it('ファイルサイズが不正の場合はエラー', async () => {
    const repository = createJobRepositoryMock();
    const service = new JobService(repository);

    await expect(
      service.createJob({
        originalFileName: 'movie.mp4',
        fileSize: 0,
      })
    ).rejects.toThrow('ファイルサイズは0より大きい必要があります');
  });

  it('ジョブIDが空の場合は getJob でエラー', async () => {
    const repository = createJobRepositoryMock();
    const service = new JobService(repository);

    await expect(service.getJob('   ')).rejects.toThrow('ジョブIDは必須です');
  });

  it('ステータス更新時に FAILED でエラーメッセージが空ならエラー', async () => {
    const repository = createJobRepositoryMock();
    const service = new JobService(repository);

    await expect(service.updateStatus('job-1', 'FAILED')).rejects.toThrow(
      'FAILEDステータスではエラーメッセージが必須です'
    );
  });

  it('ステータス更新時にエラーメッセージを trim して渡す', async () => {
    const repository = createJobRepositoryMock();
    const service = new JobService(repository);

    const updatedJob: Job = {
      jobId: 'job-1',
      status: 'FAILED',
      originalFileName: 'movie.mp4',
      fileSize: 1,
      createdAt: 1,
      expiresAt: 2,
      errorMessage: '解析失敗',
    };
    repository.updateStatus.mockResolvedValue(updatedJob);

    const result = await service.updateStatus('job-1', 'FAILED', ' 解析失敗 ');

    expect(repository.updateStatus).toHaveBeenCalledWith('job-1', 'FAILED', '解析失敗');
    expect(result).toEqual(updatedJob);
  });
});
