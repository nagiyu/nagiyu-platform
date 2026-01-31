'use client';

import { Button } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import { signIn } from 'next-auth/react';

interface SignInButtonProps {
  callbackUrl: string;
}

export function SignInButton({ callbackUrl }: SignInButtonProps) {
  const handleSignIn = async () => {
    await signIn('google', {
      callbackUrl,
    });
  };

  return (
    <Button
      onClick={handleSignIn}
      variant="contained"
      size="large"
      startIcon={<GoogleIcon />}
      fullWidth
    >
      Google でサインイン
    </Button>
  );
}
