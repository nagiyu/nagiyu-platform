import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import Home from '@/app/page';

describe('Home', () => {
  it('デフォルト個人リストの TodoList をモック表示する', () => {
    render(<Home />);

    expect(screen.getByRole('heading', { level: 1, name: 'デフォルト個人リスト' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'ToDo' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'タイトル' })).toBeInTheDocument();
    expect(screen.getByText('牛乳を買う')).toBeInTheDocument();
  });
});
