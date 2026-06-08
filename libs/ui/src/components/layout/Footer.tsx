'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { Box, Container, Typography, Link, Grid, Stack } from '@mui/material';
import PrivacyPolicyDialog, { type PolicySection } from '../dialogs/PrivacyPolicyDialog';
import TermsOfServiceDialog, { type TermSection } from '../dialogs/TermsOfServiceDialog';

/** フッターに表示するリンク項目 */
export interface FooterLinkItem {
  /** 表示テキスト */
  label: string;
  /** リンク先 URL */
  href: string;
}

/** フッターに表示するリンクグループ */
export interface FooterLinkGroup {
  /** グループのタイトル（省略可） */
  title?: string;
  /** グループ内のリンク項目一覧 */
  items: FooterLinkItem[];
}

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

  /**
   * フッターに表示するナビゲーションリンクグループ一覧。
   * 指定した場合、バージョン行の上部にリンクグリッドを表示する。
   * 省略時はリンクグリッドを表示しない（既存の挙動を維持）。
   */
  links?: FooterLinkGroup[];

  /**
   * 著作権表記文字列。
   * 指定した場合、フッター下部にコピーライト表記を表示する。
   * 例: "© 2026 nagiyu"
   */
  copyright?: string;
}

export default function Footer({
  version = '1.0.0',
  contactHref,
  termsContent,
  privacyContent,
  licenseText,
  links,
  copyright,
}: FooterProps) {
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  /** リンクグループが存在するかどうか */
  const hasLinks = links && links.length > 0;

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
          {/* ナビゲーションリンクグリッド（links props がある場合のみ表示） */}
          {hasLinks && (
            <Grid container spacing={2} sx={{ mb: 2 }}>
              {links.map((group, groupIndex) => (
                <Grid key={groupIndex} size={{ xs: 6, sm: 4, md: 3 }}>
                  {group.title && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontWeight: 'bold', display: 'block', mb: 0.5 }}
                    >
                      {group.title}
                    </Typography>
                  )}
                  <Stack spacing={0.5}>
                    {group.items.map((item, itemIndex) => (
                      <Link
                        key={itemIndex}
                        href={item.href}
                        color="inherit"
                        sx={{
                          color: 'text.secondary',
                          fontSize: '0.8rem',
                          display: 'block',
                        }}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </Stack>
                </Grid>
              ))}
            </Grid>
          )}

          {/* バージョン・ポリシー行（既存の構造を維持） */}
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

          {/* ライセンス表記（licenseText props がある場合のみ表示） */}
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

          {/* 著作権表記（copyright props がある場合のみ表示） */}
          {copyright && (
            <Typography
              variant="caption"
              color="text.secondary"
              align="center"
              sx={{ display: 'block', mt: 0.5 }}
            >
              {copyright}
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
