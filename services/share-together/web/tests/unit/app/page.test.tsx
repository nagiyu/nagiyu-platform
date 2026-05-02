import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import Home from '@/app/page';
import { saveLastVisitedPath } from '@/lib/lastVisitedPath';

const mockReplace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

describe('Home', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockReplace.mockReset();
  });

  it('保存値がない場合はサービス紹介と主要導線を表示し、リダイレクトしない', () => {
    render(<Home />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Share Together へようこそ' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'リストを開く' })).toHaveAttribute('href', '/lists');
    expect(screen.getByRole('link', { name: 'グループを管理' })).toHaveAttribute('href', '/groups');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('保存された最終訪問ページがあればそのページへリダイレクトする', () => {
    saveLastVisitedPath('/lists');

    render(<Home />);

    expect(mockReplace).toHaveBeenCalledWith('/lists');
  });

  it('保存値がルート "/" の場合はリダイレクトしない', () => {
    window.localStorage.setItem('share-together:last-visited-path', '/');

    render(<Home />);

    expect(mockReplace).not.toHaveBeenCalled();
  });
});
