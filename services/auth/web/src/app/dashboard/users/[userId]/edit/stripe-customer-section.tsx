'use client';

import { useState } from 'react';
import { Box, Typography } from '@mui/material';
import { Button, ConfirmDialog, ErrorAlert } from '@nagiyu/ui';
import { unlinkStripeCustomer } from '@/lib/stripe-customer-client';

const LABELS = {
  CUSTOMER: 'Stripe の顧客',
  UNLINK: '顧客との対応を外す',
  DIALOG_TITLE: '顧客との対応を外しますか',
  DIALOG_DESCRIPTION:
    'Stripe 上の契約は解約されません。契約が残っている場合は、先に Stripe で解約してください。対応を外すと、このユーザーの Stripe 由来の有効な権利も取り消されます。',
  CONFIRM: '対応を外す',
} as const;

interface StripeCustomerSectionProps {
  userId: string;
  customerId: string;
  /** 保存中など、ほかの操作と重ならないよう操作を止める */
  disabled: boolean;
  /** 対応を外した後の、更新されたユーザー (形式は未検証) */
  onUnlinked: (user: unknown) => void;
}

/**
 * ユーザー編集画面の Stripe の顧客の対応の欄。
 *
 * 下部の「保存」でまとめて送る変更とは別に、確認のうえその場で実行する。
 */
export function StripeCustomerSection({
  userId,
  customerId,
  disabled,
  onUnlinked,
}: StripeCustomerSectionProps) {
  const [open, setOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setProcessing(true);
    setError(null);
    const result = await unlinkStripeCustomer(userId);
    setProcessing(false);
    setOpen(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onUnlinked(result.user);
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="body1" gutterBottom>
        <strong>{LABELS.CUSTOMER}:</strong> {customerId}
      </Typography>
      <Button
        variant="outline"
        color="danger"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        {LABELS.UNLINK}
      </Button>
      {error && <ErrorAlert message={error} />}
      <ConfirmDialog
        open={open}
        title={LABELS.DIALOG_TITLE}
        description={LABELS.DIALOG_DESCRIPTION}
        confirmLabel={LABELS.CONFIRM}
        loading={processing}
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
      />
    </Box>
  );
}
