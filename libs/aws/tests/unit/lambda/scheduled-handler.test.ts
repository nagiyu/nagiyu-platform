import { logger } from '@nagiyu/common';
import {
  createScheduledHandler,
  ScheduledHandlerError,
  type ScheduledEvent,
} from '../../../src/lambda/scheduled-handler.js';
import { reportErrorEvent } from '../../../src/error-events/report.js';

jest.mock('../../../src/error-events/report.js', () => ({
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

const mockReport = reportErrorEvent as jest.MockedFunction<typeof reportErrorEvent>;

const scheduledEvent: ScheduledEvent = {
  version: '0',
  id: 'evt-1',
  'detail-type': 'Scheduled Event',
  source: 'aws.events',
  account: '123',
  time: '2026-01-01T00:00:00Z',
  region: 'ap-northeast-1',
  resources: [],
  detail: {},
};

const baseOptions = { serviceId: 'svc', name: 'notify', errorTitle: '通知バッチ失敗' };

describe('createScheduledHandler', () => {
  let infoSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockReport.mockClear();
    infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
    errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('成功時は fn の結果をそのまま返し、開始ログを出す', async () => {
    const result = { statusCode: 200, body: 'ok' };
    const handler = createScheduledHandler(baseOptions, async () => result);

    await expect(handler(scheduledEvent)).resolves.toBe(result);
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledWith('[notify] バッチ開始', {
      eventId: 'evt-1',
      eventTime: '2026-01-01T00:00:00Z',
    });
    expect(mockReport).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('失敗時はログ出力とエラー報告を行い元の例外を再送出する', async () => {
    const error = new Error('boom');
    const handler = createScheduledHandler(baseOptions, async () => {
      throw error;
    });

    await expect(handler(scheduledEvent)).rejects.toBe(error);
    expect(errorSpy).toHaveBeenCalledWith('[notify] バッチ失敗', {
      eventId: 'evt-1',
      eventTime: '2026-01-01T00:00:00Z',
      error: 'boom',
    });
    expect(mockReport).toHaveBeenCalledTimes(1);
    expect(mockReport).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'svc',
        severity: 'error',
        title: '通知バッチ失敗',
        message: 'boom',
        context: expect.objectContaining({
          eventId: 'evt-1',
          errorName: 'Error',
          errorMessage: 'boom',
          errorStack: expect.any(String),
        }),
      })
    );
  });

  it('getLogContext 指定時はその内容を各ログと報告に使う', async () => {
    const handler = createScheduledHandler<{ jobId: string }, void>(
      { ...baseOptions, getLogContext: (e) => ({ jobId: e.jobId }) },
      async () => {
        throw new Error('x');
      }
    );

    await expect(handler({ jobId: 'j1' })).rejects.toThrow('x');
    expect(infoSpy).toHaveBeenCalledWith('[notify] バッチ開始', { jobId: 'j1' });
    expect(errorSpy).toHaveBeenCalledWith('[notify] バッチ失敗', { jobId: 'j1', error: 'x' });
    expect(mockReport).toHaveBeenCalledWith(
      expect.objectContaining({ context: expect.objectContaining({ jobId: 'j1' }) })
    );
  });

  it.each([
    ['プロパティを持たないオブジェクト', {}],
    ['undefined', undefined],
    ['null', null],
    ['文字列でない id / time', { id: 1, time: 2 }],
  ])('ScheduledEvent でない event（%s）でも空 context で動作する', async (_label, event) => {
    const handler = createScheduledHandler<unknown, string>(baseOptions, async () => 'done');

    await expect(handler(event)).resolves.toBe('done');
    expect(infoSpy).toHaveBeenCalledWith('[notify] バッチ開始', {});
  });

  it('文字列でない例外でも再送出する', async () => {
    const handler = createScheduledHandler<unknown, string>(baseOptions, async () => {
      throw 'str';
    });

    await expect(handler({})).rejects.toBe('str');
    expect(mockReport).toHaveBeenCalledTimes(1);
  });

  it('ScheduledHandlerError の title と context で報告を上書き・マージし、元の例外を再送出する', async () => {
    const error = new ScheduledHandlerError('一部失敗', {
      title: '部分失敗',
      context: { failedIds: ['a', 'b'] },
    });
    const handler = createScheduledHandler(baseOptions, async () => {
      throw error;
    });

    await expect(handler(scheduledEvent)).rejects.toBe(error);
    expect(mockReport).toHaveBeenCalledTimes(1);
    expect(mockReport).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '部分失敗',
        message: '一部失敗',
        context: expect.objectContaining({
          eventId: 'evt-1',
          failedIds: ['a', 'b'],
          errorName: 'ScheduledHandlerError',
          errorMessage: '一部失敗',
        }),
      })
    );
  });

  it('ScheduledHandlerError の title / context が未指定なら errorTitle と既定 context を使う', async () => {
    const handler = createScheduledHandler(baseOptions, async () => {
      throw new ScheduledHandlerError('x');
    });

    await expect(handler(scheduledEvent)).rejects.toThrow('x');
    expect(mockReport).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '通知バッチ失敗',
        context: expect.objectContaining({ eventId: 'evt-1' }),
      })
    );
  });
});
