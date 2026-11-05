import { render, screen } from '@testing-library/react';
import TokushohoPage, { metadata } from '../../../../../src/app/legal/tokushoho/page';

describe('TokushohoPage', () => {
  it('見出しと表記の内容を出し、プランのページへリンクする', () => {
    render(<TokushohoPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: '特定商取引法に基づく表記' })
    ).toBeInTheDocument();
    expect(screen.getAllByText(/請求があれば遅滞なく開示いたします/).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'プランのページ' })).toHaveAttribute('href', '/plans');
  });

  it('metadata に title と description を持つ', () => {
    expect(metadata.title).toContain('特定商取引法に基づく表記');
    expect(metadata.description).toBeTruthy();
  });
});
