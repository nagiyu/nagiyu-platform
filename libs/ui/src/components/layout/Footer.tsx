'use client';

import { Box, Container, Typography, Link } from '@mui/material';

export interface FooterProps {
  /**
   * The version to display in the footer
   * @default "1.0.0"
   */
  version?: string;
}

/**
 * Footer component that displays version information and links to privacy policy and terms of service.
 * 
 * @param props - The component props
 * @param props.version - The version string to display (default: "1.0.0")
 * @returns A footer element with version and policy links
 * 
 * @example
 * ```tsx
 * <Footer version="2.1.0" />
 * ```
 */
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
              color: 'text.secondary',
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
              color: 'text.secondary',
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
