'use client';

import { Button } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import { signIn } from 'next-auth/react';
import { useState } from 'react';

interface SignInButtonProps {
  callbackUrl: string;
}

export function SignInButton({ callbackUrl }: SignInButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
    try {
      setIsLoading(true);
      await signIn('google', {
        callbackUrl,
      });
    } catch (error) {
      console.error('サインインエラー:', error);
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleSignIn}
      variant="contained"
      size="large"
      startIcon={<GoogleIcon />}
      fullWidth
      disabled={isLoading}
    >
      {isLoading ? 'サインイン中...' : 'Google でサインイン'}
    </Button>
  );
}
