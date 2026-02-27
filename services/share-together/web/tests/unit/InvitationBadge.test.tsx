import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { InvitationBadge } from '@/components/InvitationBadge';

describe('InvitationBadge', () => {
  it('未処理招待数のモックバッジを表示する', () => {
    render(<InvitationBadge />);

    const invitationLink = screen.getByRole('link', { name: /招待/ });
    const badgeCount = screen.getByText('0');

    expect(invitationLink).toHaveAttribute('href', '/invitations');
    expect(badgeCount).toBeInTheDocument();
  });
});
