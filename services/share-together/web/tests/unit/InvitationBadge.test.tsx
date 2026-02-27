import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { InvitationBadge } from '@/components/InvitationBadge';

describe('InvitationBadge', () => {
  it('未処理招待数のモックバッジを表示する', () => {
    render(<InvitationBadge />);

    expect(screen.getByRole('link', { name: /招待/ })).toHaveAttribute('href', '/invitations');
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
