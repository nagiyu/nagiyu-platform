import { main } from '../../src/index.js';
import * as quickClipCore from '@nagiyu/quick-clip-core';

jest.mock('@nagiyu/quick-clip-core', () => ({
  validateEnvironment: jest.fn(() => ({
    batchCommand: 'extract',
    jobId: 'job-1',
    tableName: 'table',
    bucketName: 'bucket',
    awsRegion: 'ap-northeast-1',
  })),
  runQuickClipBatch: jest.fn().mockResolvedValue(undefined),
}));

const coreMocks = quickClipCore as unknown as {
  validateEnvironment: jest.Mock;
  runQuickClipBatch: jest.Mock;
};

describe('quick-clip batch', () => {
  beforeEach(() => {
    coreMocks.validateEnvironment.mockClear();
    coreMocks.runQuickClipBatch.mockClear();
  });

  it('main: core の validateEnvironment と runQuickClipBatch を呼び出す', async () => {
    await main();

    expect(coreMocks.validateEnvironment).toHaveBeenCalledTimes(1);
    expect(coreMocks.runQuickClipBatch).toHaveBeenCalledWith({
      batchCommand: 'extract',
      jobId: 'job-1',
      tableName: 'table',
      bucketName: 'bucket',
      awsRegion: 'ap-northeast-1',
    });
  });

  it('main: core のエラーをそのまま伝搬する', async () => {
    coreMocks.runQuickClipBatch.mockRejectedValueOnce(new Error('core error'));

    await expect(main()).rejects.toThrow('core error');
  });
});
