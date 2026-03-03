'use client';

import { useState } from 'react';
import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import { ERROR_MESSAGES } from '@/lib/constants/errors';

type InviteFormProps = {
  groupId: string;
  isOwner: boolean;
};

export function InviteForm({ groupId, isOwner }: InviteFormProps) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/groups/${encodeURIComponent(groupId)}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: trimmedEmail }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setSubmitted(false);
        setErrorMessage(body?.error?.message ?? ERROR_MESSAGES.INVITATION_SEND_FAILED);
        return;
      }

      setSubmitted(true);
      setEmail('');
    } catch (error) {
      console.error('メンバー招待の送信に失敗しました', { error });
      setSubmitted(false);
      setErrorMessage(ERROR_MESSAGES.INVITATION_SEND_FAILED);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {isOwner
          ? 'オーナーとしてメンバーを招待できます。'
          : 'このグループではメンバー追加はできません（オーナーのみ）。'}
      </Typography>
      {submitted && (
        <Typography variant="body2" color="success.main" sx={{ mb: 2 }}>
          招待を送信しました。
        </Typography>
      )}
      {errorMessage && (
        <Typography variant="body2" color="error" sx={{ mb: 2 }}>
          {errorMessage}
        </Typography>
      )}
      <Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            id="invite-email"
            fullWidth
            type="email"
            label="メールアドレス"
            placeholder="example@nagiyu.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setSubmitted(false);
              setErrorMessage(null);
            }}
            disabled={!isOwner}
          />
          <Button
            type="button"
            variant="contained"
            disabled={!isOwner || isSubmitting}
            onClick={handleSubmit}
          >
            招待を送信
          </Button>
        </Stack>
      </Box>
    </>
  );
}
