import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { ERROR_VIEW_MESSAGES } from '@nagiyu/ui';
import GlobalErrorPage from '@/app/global-error';
import { reportClientError } from '@/lib/client-logger';

jest.mock('@/lib/client-logger', () => ({
  reportClientError: jest.fn(),
}));

describe('GlobalErrorPage', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('GlobalErrorView の見出しを表示する', () => {
    render(<GlobalErrorPage error={new Error('テスト用の例外')} retry={jest.fn()} />);

    expect(
      screen.getByRole('heading', { level: 1, name: ERROR_VIEW_MESSAGES.DEFAULT_TITLE })
    ).toBeInTheDocument();
  });

  it('「もう一度試す」を押すと retry が呼ばれる', () => {
    const retry = jest.fn();
    render(<GlobalErrorPage error={new Error('テスト用の例外')} retry={retry} />);

    fireEvent.click(screen.getByRole('button', { name: ERROR_VIEW_MESSAGES.RETRY_BUTTON }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('受け取った例外を console.error に渡す', () => {
    const error = new Error('テスト用の例外');
    render(<GlobalErrorPage error={error} retry={jest.fn()} />);

    expect(consoleErrorSpy).toHaveBeenCalledWith(error);
  });

  it('例外の内容をクライアントログとして報告する', () => {
    const error = new Error('テスト用の例外');
    render(<GlobalErrorPage error={error} retry={jest.fn()} />);

    expect(reportClientError).toHaveBeenCalledWith(
      'error',
      '画面表示中の例外',
      'テスト用の例外',
      expect.objectContaining({ screen: 'error-boundary', stack: error.stack })
    );
  });

  it('Error 以外の値が投げられても文字列化して報告する', () => {
    render(<GlobalErrorPage error="文字列の例外" retry={jest.fn()} />);

    expect(reportClientError).toHaveBeenCalledWith(
      'error',
      '画面表示中の例外',
      '文字列の例外',
      expect.objectContaining({ stack: undefined })
    );
  });
});
