'use client';

import { Box, Container, Typography, Link } from '@mui/material';

interface FooterProps {
  version?: string;
}

export default function Footer({ version = '1.0.0' }: FooterProps) {
  return (
    <Box
      component="footer"
      sx={{
        py: 3,
        px: 2,
        mt: 'auto',
        backgroundColor: (theme) => theme.palette.grey[200],
      }}
    >
      <Container maxWidth="lg">
        <Typography variant="body2" color="text.secondary" align="center">
          v{version}
          {' | '}
          <Link
            color="inherit"
            href="/privacy"
            sx={{
              pointerEvents: 'none',
              color: 'text.disabled',
              textDecoration: 'none',
            }}
          >
            プライバシーポリシー
          </Link>
          {' | '}
          <Link
            color="inherit"
            href="/terms"
            sx={{
              pointerEvents: 'none',
              color: 'text.disabled',
              textDecoration: 'none',
            }}
          >
            利用規約
          </Link>
        </Typography>
      </Container>
    </Box>
  );
}
