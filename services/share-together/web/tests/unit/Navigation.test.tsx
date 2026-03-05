import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Navigation } from '@/components/Navigation';

describe('Navigation', () => {
  it('ナビゲーション項目と招待バッジプレースホルダーを表示する', () => {
    render(<Navigation />);

    expect(screen.getByText('Share Together')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ホーム' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'リスト' })).toHaveAttribute('href', '/lists');
    expect(screen.getByRole('link', { name: 'グループ' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /招待/ })).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
