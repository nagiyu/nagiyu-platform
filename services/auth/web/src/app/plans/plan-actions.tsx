'use client';

import { useState } from 'react';
import { Box } from '@mui/material';
import { Button, ErrorAlert } from '@nagiyu/ui';
import { requestRedirectUrl } from '../../lib/billing-client';
import { navigateTo } from '../../lib/navigate';

interface PlanActionButtonProps {
  endpoint: '/api/billing/checkout' | '/api/billing/portal';
  body: Record<string, unknown>;
  label: string;
  variant?: 'solid' | 'outline';
}

export function PlanActionButton({
  endpoint,
  body,
  label,
  variant = 'solid',
}: PlanActionButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    const result = await requestRedirectUrl(endpoint, body);
    if (result.ok) {
      // 遷移が終わるまでボタンを押せないままにして、二重に申し込ませない
      navigateTo(result.url);
      return;
    }
    setError(result.message);
    setLoading(false);
  };

  return (
    <Box>
      <Button variant={variant} loading={loading} onClick={handleClick}>
        {label}
      </Button>
      {error && (
        <Box sx={{ mt: 1 }}>
          <ErrorAlert message={error} />
        </Box>
      )}
    </Box>
  );
}
