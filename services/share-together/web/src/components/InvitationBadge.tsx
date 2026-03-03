'use client';

import { useEffect, useState } from 'react';
import { Badge, Button } from '@mui/material';

type InvitationsResponse = {
  data: { invitations: Array<{ groupId: string }> };
};

const ERROR_MESSAGES = {
  FETCH_INVITATIONS_FAILED: '招待バッジの取得に失敗しました',
} as const;

export function InvitationBadge() {
  const [pendingInvitations, setPendingInvitations] = useState(0);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        const response = await fetch('/api/invitations');
        if (!response.ok) {
          throw new Error(`status: ${response.status}`);
        }

        const data = (await response.json()) as InvitationsResponse;
        if (isMounted) {
          setPendingInvitations(data.data.invitations.length);
        }
      } catch (error: unknown) {
        console.error(ERROR_MESSAGES.FETCH_INVITATIONS_FAILED, { error });
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <Button color="inherit" href="/invitations">
      <Badge badgeContent={pendingInvitations} color="secondary" showZero>
        招待
      </Badge>
    </Button>
  );
}
