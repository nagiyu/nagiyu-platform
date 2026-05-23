import { withErrorReporting } from '../../../src/error-events/with-error-reporting.js';
import { reportErrorEvent } from '../../../src/error-events/report.js';
import {
  createErrorEventWriter,
  resetErrorEventWriter,
} from '../../../src/error-events/factory.js';
import { InMemoryErrorEventWriter } from '../../../src/error-events/in-memory-writer.js';

const TABLE_NAME = 'test-error-events';

function getInMemoryWriter(): InMemoryErrorEventWriter {
  return createErrorEventWriter() as InMemoryErrorEventWriter;
}

jest.mock('../../../src/error-events/report.js', () => ({
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

const mockReportErrorEvent = reportErrorEvent as jest.MockedFunction<typeof reportErrorEvent>;

describe('withErrorReporting', () => {
  beforeEach(() => {
    process.env.USE_IN_MEMORY_DB = 'true';
    process.env.ERROR_EVENTS_TABLE_NAME = TABLE_NAME;
    resetErrorEventWriter();
    mockReportErrorEvent.mockClear();
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.USE_IN_MEMORY_DB;
    delete process.env.ERROR_EVENTS_TABLE_NAME;
    resetErrorEventWriter();
  });

  describe('正常系', () => {
    it('fn が成功したとき戻り値を返す', async () => {
      const result = await withErrorReporting(
        { serviceId: 'test-service', title: 'テストエラー' },
        async () => 'success'
      );
      expect(result).toBe('success');
    });

    it('fn が成功したとき reportErrorEvent を呼ばない', async () => {
      await withErrorReporting(
        { serviceId: 'test-service', title: 'テストエラー' },
        async () => 42
      );
      expect(mockReportErrorEvent).not.toHaveBeenCalled();
    });

    it('fn が成功したとき onSuccess を呼ぶ', async () => {
      const onSuccess = jest.fn().mockResolvedValue(undefined);
      await withErrorReporting(
        { serviceId: 'test-service', title: 'テストエラー', onSuccess },
        async () => {}
      );
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  describe('エラー系', () => {
    it('fn がエラーをスローしたとき reportErrorEvent を呼ぶ', async () => {
      const error = new Error('テストエラー');
      await expect(
        withErrorReporting({ serviceId: 'test-service', title: 'バッチ失敗' }, async () => {
          throw error;
        })
      ).rejects.toThrow('テストエラー');

      expect(mockReportErrorEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceId: 'test-service',
          title: 'バッチ失敗',
          message: 'テストエラー',
        })
      );
    });

    it('context に errorName / errorMessage / errorStack を自動マージする', async () => {
      const error = new Error('詳細エラー');
      await expect(
        withErrorReporting({ serviceId: 'test-service', title: 'テスト' }, async () => {
          throw error;
        })
      ).rejects.toThrow();

      const call = mockReportErrorEvent.mock.calls[0][0];
      expect(call.context).toMatchObject({
        errorName: 'Error',
        errorMessage: '詳細エラー',
        errorStack: expect.stringContaining('Error'),
      });
    });

    it('呼び出し側の context と自動マージ context がマージされる', async () => {
      const error = new Error('エラー');
      await expect(
        withErrorReporting(
          { serviceId: 'test-service', title: 'テスト', context: { jobId: 'job-1' } },
          async () => {
            throw error;
          }
        )
      ).rejects.toThrow();

      const call = mockReportErrorEvent.mock.calls[0][0];
      expect(call.context).toMatchObject({
        jobId: 'job-1',
        errorName: 'Error',
        errorMessage: 'エラー',
      });
    });

    it('severity のデフォルトは error', async () => {
      const error = new Error('エラー');
      await expect(
        withErrorReporting({ serviceId: 'test-service', title: 'テスト' }, async () => {
          throw error;
        })
      ).rejects.toThrow();

      expect(mockReportErrorEvent).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'error' })
      );
    });

    it('severity を指定できる', async () => {
      const error = new Error('エラー');
      await expect(
        withErrorReporting(
          { serviceId: 'test-service', title: 'テスト', severity: 'critical' },
          async () => {
            throw error;
          }
        )
      ).rejects.toThrow();

      expect(mockReportErrorEvent).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'critical' })
      );
    });

    it('Error 以外がスローされたとき message / errorName を String() から生成する', async () => {
      await expect(
        withErrorReporting({ serviceId: 'test-service', title: 'テスト' }, async () => {
          throw 'string-error';
        })
      ).rejects.toBe('string-error');

      const call = mockReportErrorEvent.mock.calls[0][0];
      expect(call.message).toBe('string-error');
      expect(call.context).toMatchObject({
        errorName: 'string',
        errorMessage: 'string-error',
      });
    });

    it('onError が渡されたとき catch 内で呼ばれる', async () => {
      const onError = jest.fn().mockResolvedValue(undefined);
      const error = new Error('エラー');
      await expect(
        withErrorReporting({ serviceId: 'test-service', title: 'テスト', onError }, async () => {
          throw error;
        })
      ).rejects.toThrow();

      expect(onError).toHaveBeenCalledWith(error);
    });
  });

  describe('exitOnError', () => {
    it('exitOnError: true のとき process.exit(1) を呼ぶ', async () => {
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(
        withErrorReporting(
          { serviceId: 'test-service', title: 'テスト', exitOnError: true },
          async () => {
            throw new Error('エラー');
          }
        )
      ).rejects.toThrow('process.exit called');

      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    });
  });

  describe('runIfNotTest', () => {
    it('runIfNotTest: true かつ NODE_ENV === test のとき fn を実行しない', async () => {
      process.env.NODE_ENV = 'test';
      const fn = jest.fn().mockResolvedValue('result');
      const result = await withErrorReporting(
        { serviceId: 'test-service', title: 'テスト', runIfNotTest: true },
        fn
      );
      expect(fn).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('runIfNotTest: true かつ NODE_ENV !== test のとき fn を実行する', async () => {
      process.env.NODE_ENV = 'production';
      const fn = jest.fn().mockResolvedValue('result');
      const result = await withErrorReporting(
        { serviceId: 'test-service', title: 'テスト', runIfNotTest: true },
        fn
      );
      expect(fn).toHaveBeenCalledTimes(1);
      expect(result).toBe('result');
    });

    it('runIfNotTest が未指定のとき NODE_ENV に関係なく fn を実行する', async () => {
      process.env.NODE_ENV = 'test';
      const fn = jest.fn().mockResolvedValue('result');
      const result = await withErrorReporting({ serviceId: 'test-service', title: 'テスト' }, fn);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(result).toBe('result');
    });
  });
});
