import { fireEvent, render, screen } from '@testing-library/react';
import { ERROR_VIEW_MESSAGES } from '../../../../src/components/feedback/ErrorView';
import GlobalErrorView from '../../../../src/components/feedback/GlobalErrorView';

describe('GlobalErrorView', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // html / body をコンテナ内に描くため、React の DOM ネスト警告を黙らせる
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('ErrorView の見出しを表示する', () => {
    render(<GlobalErrorView />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      ERROR_VIEW_MESSAGES.DEFAULT_TITLE
    );
  });

  it('ErrorView を main ランドマークの中に描く', () => {
    render(<GlobalErrorView />);
    const main = screen.getByRole('main');
    expect(main).toContainElement(screen.getByRole('heading', { level: 1 }));
  });

  it('onRetry を ErrorView に渡す', () => {
    const onRetry = jest.fn();
    render(<GlobalErrorView onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: ERROR_VIEW_MESSAGES.RETRY_BUTTON }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('onRetry 未指定なら再試行ボタンを表示しない', () => {
    render(<GlobalErrorView />);
    expect(
      screen.queryByRole('button', { name: ERROR_VIEW_MESSAGES.RETRY_BUTTON })
    ).not.toBeInTheDocument();
  });

  it('title / description / homeHref を素通しする', () => {
    render(<GlobalErrorView title="独自タイトル" description="独自説明" homeHref="/home" />);
    expect(screen.getByText('独自タイトル')).toBeInTheDocument();
    expect(screen.getByText('独自説明')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: ERROR_VIEW_MESSAGES.HOME_BUTTON })).toHaveAttribute(
      'href',
      '/home'
    );
  });
});
