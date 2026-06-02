'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { Box, Container, Typography, Link } from '@mui/material';
import PrivacyPolicyDialog, { type PolicySection } from '../dialogs/PrivacyPolicyDialog';
import TermsOfServiceDialog, { type TermSection } from '../dialogs/TermsOfServiceDialog';

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

  /**
   * 差し替え利用規約データ（省略時はグローバル termSections を使用）
   */
  termsContent?: TermSection[];

  /**
   * 差し替えプライバシーポリシーデータ（省略時はグローバル privacyPolicySections を使用）
   */
  privacyContent?: PolicySection[];

  /**
   * フッター本体に常時表示するライセンス表記（バージョンと同列）
   */
  licenseText?: ReactNode | string;
}

export default function Footer({
  version = '1.0.0',
  contactHref,
  termsContent,
  privacyContent,
  licenseText,
}: FooterProps) {
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  return (
    <>
      <Box
        component="footer"
        sx={{
          // licenseText がある場合（リブトーク等）はクレジット行ぶん縦に伸びるため、
          // 上下 padding を詰めてモバイルでの見切れを抑える。
          // licenseText 未指定の既存サービスは従来どおり py: 3 を維持する。
          py: licenseText ? 1.5 : 3,
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
          {licenseText && (
            <Typography
              variant="caption"
              color="text.secondary"
              align="center"
              sx={{
                display: 'block',
                mt: 0.5,
                // 長いクレジット表記がモバイル幅で折り返しても収まるよう、
                // フォントと行間を詰めてコンパクトに表示する。
                fontSize: '0.7rem',
                lineHeight: 1.4,
              }}
            >
              {licenseText}
            </Typography>
          )}
        </Container>
      </Box>
      <PrivacyPolicyDialog
        open={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
        sections={privacyContent}
      />
      <TermsOfServiceDialog
        open={termsOpen}
        onClose={() => setTermsOpen(false)}
        sections={termsContent}
      />
    </>
  );
}
