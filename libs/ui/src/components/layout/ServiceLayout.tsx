'use client';

import type { ReactNode } from 'react';
import { Box } from '@mui/material';
import AppLayout from './AppLayout';
import Footer, { type FooterProps } from './Footer';
import Header, { type HeaderProps } from './Header';

export interface ServiceLayoutProps {
  children: ReactNode;
  /**
   * Header に渡すプロパティ。
   * 未指定時は Header コンポーネント側のデフォルト値（title/href/ariaLabel）が適用されます。
   */
  headerProps?: Partial<HeaderProps>;
  /**
   * Footer に渡すプロパティ。
   * 未指定時は Footer コンポーネント側のデフォルト値（version）が適用されます。
   */
  footerProps?: Partial<FooterProps>;
  headerSlot?: ReactNode;
  footerSlot?: ReactNode;
}

export default function ServiceLayout({
  children,
  headerProps = {},
  footerProps = {},
  headerSlot,
  footerSlot,
}: ServiceLayoutProps) {
  return (
    <AppLayout>
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        {headerSlot || <Header {...headerProps} />}
        <Box component="main" sx={{ flexGrow: 1 }}>
          {children}
        </Box>
        {footerSlot || <Footer {...footerProps} />}
      </Box>
    </AppLayout>
  );
}
