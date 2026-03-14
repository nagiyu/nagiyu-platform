'use client';

import type { ReactNode } from 'react';
import { Box } from '@mui/material';
import AppLayout from './AppLayout';
import Footer, { type FooterProps } from './Footer';
import Header, { type HeaderProps } from './Header';

export interface ServiceLayoutProps {
  children: ReactNode;
  headerProps?: HeaderProps;
  footerProps?: FooterProps;
  headerSlot?: ReactNode;
  footerSlot?: ReactNode;
}

export default function ServiceLayout({
  children,
  headerProps,
  footerProps,
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
