'use client';

import { useState } from 'react';
import { Box, Button, Stack, TextField, Typography } from '@mui/material';

type InviteFormProps = {
  isOwner: boolean;
};

export function InviteForm({ isOwner }: InviteFormProps) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    setSubmitted(true);
    setEmail('');
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
          招待を送信しました（モック）。
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
            }}
            disabled={!isOwner}
          />
          <Button type="button" variant="contained" disabled={!isOwner} onClick={handleSubmit}>
            招待を送信（モック）
          </Button>
        </Stack>
      </Box>
    </>
  );
}
