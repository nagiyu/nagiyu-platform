'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
// eslint-disable-next-line no-restricted-imports -- primary 色のツールバー上に置くため、Header のナビ項目と同じ color="inherit" による文字色の継承が必要で、@nagiyu/ui の Button では代替できない
import { Badge, Button } from '@mui/material';
import type { InvitationsResponse } from '@/types';

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
    <Button color="inherit" component={Link} href="/invitations" sx={{ mx: 0.5 }}>
      <Badge badgeContent={pendingInvitations} color="secondary" showZero>
        招待
      </Badge>
    </Button>
  );
}
