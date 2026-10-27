import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { GroupCard } from '@/components/GroupCard';

describe('GroupCard', () => {
  it('グループ名・メンバー数・リンクを表示する', () => {
    render(<GroupCard name="買い物グループ" memberCount={3} href="/groups/group-1" />);

    expect(screen.getByRole('heading', { name: '買い物グループ' })).toBeInTheDocument();
    expect(screen.getByText('メンバー数: 3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /買い物グループ/ })).toHaveAttribute(
      'href',
      '/groups/group-1'
    );
  });

  it('選択中のカードを aria-current で示し、枠線の色を変える', () => {
    render(<GroupCard name="買い物グループ" memberCount={3} onClick={jest.fn()} selected />);

    const button = screen.getByRole('button', { name: /買い物グループ/ });
    expect(button).toHaveAttribute('aria-current', 'true');
    expect(button.closest('.MuiCard-root')).toHaveStyle({ borderColor: 'rgb(25, 118, 210)' });
  });

  it('選択中でないカードには aria-current を付けない', () => {
    render(<GroupCard name="買い物グループ" memberCount={3} onClick={jest.fn()} />);

    const button = screen.getByRole('button', { name: /買い物グループ/ });
    expect(button).not.toHaveAttribute('aria-current');
    expect(button.closest('.MuiCard-root')).not.toHaveStyle({ borderColor: 'rgb(25, 118, 210)' });
  });

  it('リンクのカードでも選択中を aria-current で示す', () => {
    render(<GroupCard name="買い物グループ" memberCount={3} href="/groups/group-1" selected />);

    expect(screen.getByRole('link', { name: /買い物グループ/ })).toHaveAttribute(
      'aria-current',
      'true'
    );
  });

  it('クリックで onClick を呼ぶ', () => {
    const onClick = jest.fn();
    render(<GroupCard name="買い物グループ" memberCount={3} onClick={onClick} />);

    fireEvent.click(screen.getByRole('button', { name: /買い物グループ/ }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
