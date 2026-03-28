import { main } from '../../src/index.js';
import * as quickClipCore from '@nagiyu/quick-clip-core';
import * as batchEnvironment from '../../src/lib/environment.js';

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

describe('quick-clip batch', () => {
  beforeEach(() => {
    envMocks.validateEnvironment.mockClear();
    coreMocks.runQuickClipBatch.mockClear();
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
});
