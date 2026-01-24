'use client';

import { useState } from 'react';
import { Box, Container, Typography, Link } from '@mui/material';
import PrivacyPolicyDialog from '../dialogs/PrivacyPolicyDialog';
import TermsOfServiceDialog from '../dialogs/TermsOfServiceDialog';

export interface FooterProps {
  /**
   * The version to display in the footer
   * @default "1.0.0"
   */
  version?: string;

  /**
   * Optional contact page link
   * When provided, a link to the contact page will be displayed
   */
  contactHref?: string;
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
export default function Footer({ version = '1.0.0', contactHref }: FooterProps) {
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  return (
    <>
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
              component="button"
              color="inherit"
              onClick={() => setPrivacyOpen(true)}
              sx={{
                color: 'text.secondary',
              }}
            >
              プライバシーポリシー
            </Link>
            {' | '}
            <Link
              component="button"
              color="inherit"
              onClick={() => setTermsOpen(true)}
              sx={{
                color: 'text.secondary',
              }}
            >
              利用規約
            </Link>
            {contactHref && (
              <>
                {' | '}
                <Link
                  href={contactHref}
                  color="inherit"
                  sx={{
                    color: 'text.secondary',
                  }}
                >
                  お問い合わせ
                </Link>
              </>
            )}
          </Typography>
        </Container>
      </Box>
      <PrivacyPolicyDialog open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
      <TermsOfServiceDialog open={termsOpen} onClose={() => setTermsOpen(false)} />
    </>
  );
}
