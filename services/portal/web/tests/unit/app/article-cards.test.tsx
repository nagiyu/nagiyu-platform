import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import ArticleCardLink from '@/components/ArticleCardLink';
import HomeLatestArticlesSection from '@/components/HomeLatestArticlesSection';
import HomeFeaturedSection from '@/components/HomeFeaturedSection';
import TechPage from '@/app/tech/page';
import type { ArticleMeta } from '@/types/content';

const article: ArticleMeta = {
  slug: 'sample',
  title: 'サンプル記事',
  description: '説明文です。',
  publishedAt: '2026-01-01',
  tags: ['AWS'],
} as ArticleMeta;

jest.mock('@/lib/content', () => ({
  getAllArticles: () => [
    {
      slug: 'sample',
      title: 'サンプル記事',
      description: '説明文です。',
      publishedAt: '2026-01-01',
      tags: ['AWS'],
    },
  ],
  getCategoryLabel: (c: string) => c,
}));

describe('記事カードのリンク', () => {
  it('ArticleCardLink は記事へのリンクで中身を包み、入れ子のリンクを作らない', () => {
    render(
      <ArticleCardLink slug="sample">
        <span>中身</span>
      </ArticleCardLink>
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/tech/sample');
    expect(link).toHaveTextContent('中身');
    expect(link).toHaveTextContent('記事を読む');
    expect(link.querySelector('a, button')).toBeNull();
  });

  it('最新記事セクションはカード全体がリンクで、説明文が公開日順の並びに合う', () => {
    render(<HomeLatestArticlesSection articles={[article]} />);
    const link = screen.getByRole('link', { name: /サンプル記事/ });
    expect(link).toHaveAttribute('href', '/tech/sample');
    expect(screen.getByText(/新しく公開した技術記事です/)).toBeInTheDocument();
    expect(screen.queryByText(/直近に公開・更新/)).toBeNull();
  });

  it('特集セクションはカード全体がリンクになる', () => {
    render(<HomeFeaturedSection articles={[article]} />);
    expect(screen.getByRole('link', { name: /サンプル記事/ })).toHaveAttribute(
      'href',
      '/tech/sample'
    );
  });

  it('記事一覧ページはカード全体がリンクになる', () => {
    render(<TechPage />);
    expect(screen.getByRole('link', { name: /サンプル記事/ })).toHaveAttribute(
      'href',
      '/tech/sample'
    );
  });
});
