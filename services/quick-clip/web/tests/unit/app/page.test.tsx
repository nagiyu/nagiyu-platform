import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import Home from '@/app/page';

describe('Home', () => {
  it('QuickClip の見出しと説明文を表示する', () => {
    render(<Home />);

    expect(screen.getByRole('heading', { level: 1, name: 'QuickClip' })).toBeInTheDocument();
    expect(
      screen.getByText('Phase 1 では基盤のみを提供します。画面機能は Phase 2 で実装予定です。')
    ).toBeInTheDocument();
  });
});
