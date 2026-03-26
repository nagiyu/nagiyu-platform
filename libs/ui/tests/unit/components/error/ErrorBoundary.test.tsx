import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from '../../../../src/components/error/ErrorBoundary';
import { useErrorHandler } from '../../../../src/components/error/ErrorBoundary';

function ThrowError(): React.ReactNode {
  throw new Error('test error');
}

function ThrowWithHandler(): React.ReactNode {
  const handleError = useErrorHandler();
  return <button onClick={() => handleError(new Error('hook error'))}>throw with handler</button>;
}

describe('ErrorBoundary', () => {
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  afterEach(() => {
    consoleErrorSpy.mockClear();
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it('エラーがない場合は children を表示する', () => {
    render(
      <ErrorBoundary>
        <div>child content</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('エラー時に fallback を表示する', () => {
    render(
      <ErrorBoundary fallback={<div>fallback content</div>}>
        {React.createElement(ThrowError)}
      </ErrorBoundary>
    );

    expect(screen.getByText('fallback content')).toBeInTheDocument();
  });

  it('onError が指定されている場合に呼び出される', () => {
    const onError = jest.fn();

    render(<ErrorBoundary onError={onError}>{React.createElement(ThrowError)}</ErrorBoundary>);

    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('useErrorHandler で送出したエラーを ErrorBoundary が捕捉する', async () => {
    const user = userEvent.setup();
    const onError = jest.fn();

    render(
      <ErrorBoundary onError={onError}>
        <ThrowWithHandler />
      </ErrorBoundary>
    );

    await user.click(screen.getByRole('button', { name: 'throw with handler' }));
    expect(screen.getByText('エラーが発生しました')).toBeInTheDocument();
    expect(onError).toHaveBeenCalledTimes(1);
    const [error] = onError.mock.calls[0] as [Error, React.ErrorInfo];
    expect(error.message).toBe('hook error');
  });

  it('デフォルトエラーUIで再読み込みボタンを表示する', () => {
    render(<ErrorBoundary>{React.createElement(ThrowError)}</ErrorBoundary>);

    expect(screen.getByRole('button', { name: 'ページを再読み込み' })).toBeInTheDocument();
  });
});
