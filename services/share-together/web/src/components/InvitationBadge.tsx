'use client';

import { Badge, Button } from '@mui/material';

const MOCK_PENDING_INVITATIONS = 0;

export function InvitationBadge() {
  return (
    <Button color="inherit" href="/invitations">
      <Badge badgeContent={MOCK_PENDING_INVITATIONS} color="secondary" showZero>
        招待
      </Badge>
    </Button>
  );
}
