import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import TokushohoPage from '@/app/legal/tokushoho/page';

describe('TokushohoPage', () => {
  const original = process.env.NEXT_PUBLIC_AUTH_URL;

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_AUTH_URL;
    else process.env.NEXT_PUBLIC_AUTH_URL = original;
  });

  it('見出しを表示し、プランへのリンクを auth の絶対 URL にする', () => {
    process.env.NEXT_PUBLIC_AUTH_URL = 'https://auth.example.com/';
    const { container } = render(<TokushohoPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: '特定商取引法に基づく表記' })
    ).toBeInTheDocument();
    expect(container.querySelector('a[href="https://auth.example.com/plans"]')).not.toBeNull();
  });

  it('auth の URL が未設定でもページを描画できる', () => {
    delete process.env.NEXT_PUBLIC_AUTH_URL;
    const { container } = render(<TokushohoPage />);

    expect(container.querySelector('a[href="/plans"]')).not.toBeNull();
  });
});
