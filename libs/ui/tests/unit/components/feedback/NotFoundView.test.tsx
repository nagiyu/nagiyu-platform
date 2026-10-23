import { render, screen } from '@testing-library/react';
import NotFoundView, {
  NOT_FOUND_VIEW_MESSAGES,
} from '../../../../src/components/feedback/NotFoundView';

describe('NotFoundView', () => {
  describe('デフォルト表示', () => {
    it('デフォルトのタイトルが表示される', () => {
      render(<NotFoundView />);
      expect(screen.getByText(NOT_FOUND_VIEW_MESSAGES.DEFAULT_TITLE)).toBeInTheDocument();
    });

    it('デフォルトの説明文が表示される', () => {
      render(<NotFoundView />);
      expect(screen.getByText(NOT_FOUND_VIEW_MESSAGES.DEFAULT_DESCRIPTION)).toBeInTheDocument();
    });

    it('見出しが h1 である', () => {
      render(<NotFoundView />);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        NOT_FOUND_VIEW_MESSAGES.DEFAULT_TITLE
      );
    });

    it('role="main" を持たない', () => {
      const { container } = render(<NotFoundView />);
      expect(screen.queryByRole('main')).not.toBeInTheDocument();
      expect(container.querySelector('[role="main"]')).toBeNull();
    });
  });

  describe('トップへ戻る導線', () => {
    it('既定では "/" へのリンクとして表示される', () => {
      render(<NotFoundView />);
      const link = screen.getByRole('link', { name: NOT_FOUND_VIEW_MESSAGES.HOME_BUTTON });
      expect(link).toHaveAttribute('href', '/');
    });

    it('homeHref で遷移先を上書きできる', () => {
      render(<NotFoundView homeHref="/articles" />);
      const link = screen.getByRole('link', { name: NOT_FOUND_VIEW_MESSAGES.HOME_BUTTON });
      expect(link).toHaveAttribute('href', '/articles');
    });
  });

  describe('props による上書き', () => {
    it('title を上書きできる', () => {
      render(<NotFoundView title="記事が見つかりません" />);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('記事が見つかりません');
      expect(screen.queryByText(NOT_FOUND_VIEW_MESSAGES.DEFAULT_TITLE)).not.toBeInTheDocument();
    });

    it('description を上書きできる', () => {
      render(<NotFoundView description="独自の説明文" />);
      expect(screen.getByText('独自の説明文')).toBeInTheDocument();
      expect(
        screen.queryByText(NOT_FOUND_VIEW_MESSAGES.DEFAULT_DESCRIPTION)
      ).not.toBeInTheDocument();
    });
  });
});
