import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import Home from '@/app/page';

describe('Home', () => {
  it('サービス紹介と主要導線を表示する', () => {
    render(<Home />);

    expect(screen.getByRole('heading', { level: 1, name: 'Share Together へようこそ' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'リストを開く' })).toHaveAttribute('href', '/lists');
    expect(screen.getByRole('link', { name: 'グループを管理' })).toHaveAttribute('href', '/groups');
  });
});
