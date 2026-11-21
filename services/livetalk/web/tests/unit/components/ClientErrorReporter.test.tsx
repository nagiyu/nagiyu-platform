import { render } from '@testing-library/react';
import ClientErrorReporter from '@/components/ClientErrorReporter';
import { reportClientError } from '@/lib/client-logger';

jest.mock('@/lib/client-logger', () => ({
  reportClientError: jest.fn(),
}));

function dispatchError(init: ErrorEventInit) {
  window.dispatchEvent(new ErrorEvent('error', init));
}

function dispatchRejection(reason: unknown) {
  const event = new Event('unhandledrejection') as PromiseRejectionEvent;
  Object.defineProperty(event, 'reason', { value: reason });
  window.dispatchEvent(event);
}

describe('ClientErrorReporter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('未捕捉例外では event.error を例外として渡す', () => {
    render(<ClientErrorReporter />);
    const error = new Error('boom');

    dispatchError({ message: 'boom', error, filename: 'a.js', lineno: 3 });

    expect(reportClientError).toHaveBeenCalledWith(
      'error',
      '未捕捉例外',
      'boom',
      { screen: 'global', filename: 'a.js', lineno: 3 },
      { error }
    );
  });

  it('event.error が null (クロスオリジンの Script error.) のときは例外を渡さない', () => {
    render(<ClientErrorReporter />);

    dispatchError({ message: 'Script error.', error: null });

    expect(reportClientError).toHaveBeenCalledTimes(1);
    expect((reportClientError as jest.Mock).mock.calls[0]).toHaveLength(5);
    expect((reportClientError as jest.Mock).mock.calls[0][4]).toBeUndefined();
  });

  it('message が空のときは不明なエラーにする', () => {
    render(<ClientErrorReporter />);

    dispatchError({ message: '', error: null });

    expect((reportClientError as jest.Mock).mock.calls[0][2]).toBe('不明なエラー');
  });

  it('Promise rejection の reason が Error ならそれを例外として渡す', () => {
    render(<ClientErrorReporter />);
    const reason = new Error('rejected');

    dispatchRejection(reason);

    expect(reportClientError).toHaveBeenCalledWith(
      'error',
      '未処理の Promise rejection',
      'rejected',
      { screen: 'global' },
      { error: reason }
    );
  });

  it('Promise rejection の reason が Error 以外でもそのまま例外として渡す', () => {
    render(<ClientErrorReporter />);

    dispatchRejection('文字列');

    expect(reportClientError).toHaveBeenCalledWith(
      'error',
      '未処理の Promise rejection',
      '文字列',
      { screen: 'global' },
      { error: '文字列' }
    );
  });
});
