'use client';

import * as React from 'react';
import { ServiceLayout } from '@nagiyu/ui';
import { Navigation } from '@/components/Navigation';

interface ThemeRegistryProps {
  children: React.ReactNode;
  version: string;
}

export default function ThemeRegistry({ children, version }: ThemeRegistryProps) {
  return (
    <ServiceLayout
      headerProps={{ title: 'Share Together', ariaLabel: 'Share Together ホームページに戻る' }}
      headerSlot={<Navigation />}
      footerProps={{ version }}
    >
      {children}
    </ServiceLayout>
  );
}
