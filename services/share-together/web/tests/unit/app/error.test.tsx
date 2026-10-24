import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { ERROR_VIEW_MESSAGES } from '@nagiyu/ui';
import ErrorPage from '@/app/error';

describe('ErrorPage', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('ErrorView の見出しを表示する', () => {
    render(<ErrorPage error={new Error('テスト用の例外')} retry={jest.fn()} />);

    expect(
      screen.getByRole('heading', { level: 1, name: ERROR_VIEW_MESSAGES.DEFAULT_TITLE })
    ).toBeInTheDocument();
  });

  it('「もう一度試す」を押すと retry が呼ばれる', () => {
    const retry = jest.fn();
    render(<ErrorPage error={new Error('テスト用の例外')} retry={retry} />);

    fireEvent.click(screen.getByRole('button', { name: ERROR_VIEW_MESSAGES.RETRY_BUTTON }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('受け取った例外を console.error に渡す', () => {
    const error = new Error('テスト用の例外');
    render(<ErrorPage error={error} retry={jest.fn()} />);

    expect(consoleErrorSpy).toHaveBeenCalledWith(error);
  });
});
