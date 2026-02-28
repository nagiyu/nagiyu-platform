'use client';

import { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import type { ButtonProps } from '@mui/material';

type MockActionButtonProps = {
  label: string;
  feedback?: string;
  successLabel?: string;
  buttonProps?: Omit<ButtonProps, 'children' | 'onClick'>;
};

export function MockActionButton({
  label,
  feedback,
  successLabel,
  buttonProps,
}: MockActionButtonProps) {
  const [clicked, setClicked] = useState(false);
  const { disabled, ...restButtonProps } = buttonProps ?? {};
  const isDisabled = Boolean(disabled) || clicked;

  return (
    <Box>
      <Button {...restButtonProps} disabled={isDisabled} onClick={() => setClicked(true)}>
        {clicked ? (successLabel ?? `${label}済み`) : label}
      </Button>
      {clicked && feedback ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {feedback}
        </Typography>
      ) : null}
    </Box>
  );
}
