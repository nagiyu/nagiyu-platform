import { main } from '../../src/index.js';
import * as quickClipCore from '@nagiyu/quick-clip-core';
import { reportErrorEvent } from '@nagiyu/aws';
import * as batchEnvironment from '../../src/lib/environment.js';

jest.mock('@nagiyu/aws', () => ({
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));
jest.mock('@nagiyu/quick-clip-core', () => ({
  runQuickClipBatch: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/lib/environment.js', () => ({
  validateEnvironment: jest.fn(() => ({
    command: 'extract',
    jobId: 'job-1',
    tableName: 'table',
    bucketName: 'bucket',
    awsRegion: 'ap-northeast-1',
  })),
}));

const coreMocks = quickClipCore as unknown as {
  runQuickClipBatch: jest.Mock;
};
const envMocks = batchEnvironment as unknown as {
  validateEnvironment: jest.Mock;
};
const reportErrorEventMock = reportErrorEvent as jest.MockedFunction<typeof reportErrorEvent>;

describe('quick-clip batch', () => {
  beforeEach(() => {
    envMocks.validateEnvironment.mockClear();
    coreMocks.runQuickClipBatch.mockClear();
    reportErrorEventMock.mockClear();
  });

  it('main: batch の validateEnvironment と core の runQuickClipBatch を呼び出す', async () => {
    await main();

    expect(envMocks.validateEnvironment).toHaveBeenCalledTimes(1);
    expect(coreMocks.runQuickClipBatch).toHaveBeenCalledWith({
      command: 'extract',
      jobId: 'job-1',
      tableName: 'table',
      bucketName: 'bucket',
      awsRegion: 'ap-northeast-1',
    });
  });

  it('main: split コマンドをそのまま受けず validateEnvironment のエラーを伝搬する', async () => {
    envMocks.validateEnvironment.mockImplementationOnce(() => {
      throw new Error('必要な環境変数が設定されていません: BATCH_COMMAND');
    });

    await expect(main()).rejects.toThrow('必要な環境変数が設定されていません: BATCH_COMMAND');
    expect(coreMocks.runQuickClipBatch).not.toHaveBeenCalled();
  });

  it('main: validateEnvironment のエラーをそのまま伝搬する', async () => {
    envMocks.validateEnvironment.mockImplementationOnce(() => {
      throw new Error('env error');
    });

    await expect(main()).rejects.toThrow('env error');
    expect(coreMocks.runQuickClipBatch).not.toHaveBeenCalled();
  });

  it('main: core のエラーをそのまま伝搬する', async () => {
    coreMocks.runQuickClipBatch.mockRejectedValueOnce(new Error('core error'));

    await expect(main()).rejects.toThrow('core error');
  });

  it('main: 正常終了時は reportErrorEvent を呼ばない', async () => {
    await main();

    expect(reportErrorEventMock).not.toHaveBeenCalled();
  });

  it('main: core のエラー時に reportErrorEvent を critical で呼ぶ', async () => {
    coreMocks.runQuickClipBatch.mockRejectedValueOnce(new Error('core error'));

    await expect(main()).rejects.toThrow('core error');
    expect(reportErrorEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'quick-clip',
        severity: 'critical',
        message: 'core error',
        context: expect.objectContaining({ jobId: 'job-1' }),
      })
    );
  });

  it('main: validateEnvironment 失敗時も reportErrorEvent を critical で呼ぶ', async () => {
    envMocks.validateEnvironment.mockImplementationOnce(() => {
      throw new Error('env error');
    });

    await expect(main()).rejects.toThrow('env error');
    expect(reportErrorEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'quick-clip',
        severity: 'critical',
        message: 'env error',
      })
    );
  });
});
