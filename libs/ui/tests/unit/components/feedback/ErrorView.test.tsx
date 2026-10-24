import { fireEvent, render, screen } from '@testing-library/react';
import ErrorView, { ERROR_VIEW_MESSAGES } from '../../../../src/components/feedback/ErrorView';

describe('ErrorView', () => {
  describe('デフォルト表示', () => {
    it('デフォルトのタイトルが表示される', () => {
      render(<ErrorView />);
      expect(screen.getByText(ERROR_VIEW_MESSAGES.DEFAULT_TITLE)).toBeInTheDocument();
    });

    it('デフォルトの説明文が表示される', () => {
      render(<ErrorView />);
      expect(screen.getByText(ERROR_VIEW_MESSAGES.DEFAULT_DESCRIPTION)).toBeInTheDocument();
    });

    it('見出しが h1 である', () => {
      render(<ErrorView />);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        ERROR_VIEW_MESSAGES.DEFAULT_TITLE
      );
    });

    it('role="main" を持たない', () => {
      const { container } = render(<ErrorView />);
      expect(screen.queryByRole('main')).not.toBeInTheDocument();
      expect(container.querySelector('[role="main"]')).toBeNull();
    });
  });

  describe('再試行ボタン', () => {
    it('onRetry 未指定のときは表示されない', () => {
      render(<ErrorView />);
      expect(
        screen.queryByRole('button', { name: ERROR_VIEW_MESSAGES.RETRY_BUTTON })
      ).not.toBeInTheDocument();
    });

    it('onRetry 指定時に表示される', () => {
      render(<ErrorView onRetry={jest.fn()} />);
      expect(
        screen.getByRole('button', { name: ERROR_VIEW_MESSAGES.RETRY_BUTTON })
      ).toBeInTheDocument();
    });

    it('押下すると onRetry が呼ばれる', () => {
      const onRetry = jest.fn();
      render(<ErrorView onRetry={onRetry} />);
      fireEvent.click(screen.getByRole('button', { name: ERROR_VIEW_MESSAGES.RETRY_BUTTON }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('トップへ戻る導線', () => {
    it('既定では "/" へのリンクとして表示される', () => {
      render(<ErrorView />);
      const link = screen.getByRole('link', { name: ERROR_VIEW_MESSAGES.HOME_BUTTON });
      expect(link).toHaveAttribute('href', '/');
    });

    it('homeHref で遷移先を上書きできる', () => {
      render(<ErrorView homeHref="/articles" />);
      const link = screen.getByRole('link', { name: ERROR_VIEW_MESSAGES.HOME_BUTTON });
      expect(link).toHaveAttribute('href', '/articles');
    });

    it('onRetry の有無にかかわらず表示される', () => {
      render(<ErrorView onRetry={jest.fn()} />);
      expect(
        screen.getByRole('link', { name: ERROR_VIEW_MESSAGES.HOME_BUTTON })
      ).toBeInTheDocument();
    });
  });

  describe('props による上書き', () => {
    it('title を上書きできる', () => {
      render(<ErrorView title="読み込みに失敗しました" />);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('読み込みに失敗しました');
      expect(screen.queryByText(ERROR_VIEW_MESSAGES.DEFAULT_TITLE)).not.toBeInTheDocument();
    });

    it('description を上書きできる', () => {
      render(<ErrorView description="独自の説明文" />);
      expect(screen.getByText('独自の説明文')).toBeInTheDocument();
      expect(screen.queryByText(ERROR_VIEW_MESSAGES.DEFAULT_DESCRIPTION)).not.toBeInTheDocument();
    });
  });
});
