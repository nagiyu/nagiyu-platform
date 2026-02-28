'use client';

import { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import type { ButtonProps } from '@mui/material';

type MockActionButtonProps = {
  label: string;
  feedback: string;
  buttonProps?: Omit<ButtonProps, 'children' | 'onClick'>;
};

export function MockActionButton({ label, feedback, buttonProps }: MockActionButtonProps) {
  const [clicked, setClicked] = useState(false);

  return (
    <Box>
      <Button {...buttonProps} onClick={() => setClicked(true)}>
        {label}
      </Button>
      {clicked ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {feedback}
        </Typography>
      ) : null}
    </Box>
  );
}
