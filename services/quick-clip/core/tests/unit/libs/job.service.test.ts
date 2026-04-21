import { JobService } from '../../../src/libs/job.service.js';
import type { JobRepository } from '../../../src/repositories/job.repository.interface.js';
import type { Job } from '../../../src/types.js';

const createJobRepositoryMock = (): jest.Mocked<JobRepository> => ({
  getById: jest.fn(),
  create: jest.fn(),
  updateBatchJobId: jest.fn(),
  updateBatchStage: jest.fn(),
  updateErrorMessage: jest.fn(),
  createMany: jest.fn(),
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
    expect(createdJob.batchJobId).toBeUndefined();
    expect(createdJob.batchStage).toBeUndefined();
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

  it('updateBatchJobId: ジョブIDが空の場合はエラー', async () => {
    const repository = createJobRepositoryMock();
    const service = new JobService(repository);

    await expect(service.updateBatchJobId('   ', 'batch-job-1')).rejects.toThrow(
      'ジョブIDは必須です'
    );
  });

  it('updateBatchJobId: リポジトリの updateBatchJobId を呼ぶ', async () => {
    const repository = createJobRepositoryMock();
    const service = new JobService(repository);

    repository.updateBatchJobId.mockResolvedValue(undefined);

    await service.updateBatchJobId('job-1', 'batch-job-1');

    expect(repository.updateBatchJobId).toHaveBeenCalledWith('job-1', 'batch-job-1');
  });

  it('updateBatchStage: ジョブIDが空の場合はエラー', async () => {
    const repository = createJobRepositoryMock();
    const service = new JobService(repository);

    await expect(service.updateBatchStage('   ', 'downloading')).rejects.toThrow(
      'ジョブIDは必須です'
    );
  });

  it('updateBatchStage: リポジトリの updateBatchStage を呼ぶ', async () => {
    const repository = createJobRepositoryMock();
    const service = new JobService(repository);

    repository.updateBatchStage.mockResolvedValue(undefined);

    await service.updateBatchStage('job-1', 'analyzing');

    expect(repository.updateBatchStage).toHaveBeenCalledWith('job-1', 'analyzing');
  });

  it('updateErrorMessage: ジョブIDが空の場合はエラー', async () => {
    const repository = createJobRepositoryMock();
    const service = new JobService(repository);

    await expect(service.updateErrorMessage('   ', 'エラー発生')).rejects.toThrow(
      'ジョブIDは必須です'
    );
  });

  it('updateErrorMessage: エラーメッセージが空の場合はエラー', async () => {
    const repository = createJobRepositoryMock();
    const service = new JobService(repository);

    await expect(service.updateErrorMessage('job-1', '   ')).rejects.toThrow(
      'FAILEDステータスではエラーメッセージが必須です'
    );
  });

  it('updateErrorMessage: エラーメッセージを trim してリポジトリに渡す', async () => {
    const repository = createJobRepositoryMock();
    const service = new JobService(repository);

    repository.updateErrorMessage.mockResolvedValue(undefined);

    await service.updateErrorMessage('job-1', ' 解析失敗 ');

    expect(repository.updateErrorMessage).toHaveBeenCalledWith('job-1', '解析失敗');
  });
});
