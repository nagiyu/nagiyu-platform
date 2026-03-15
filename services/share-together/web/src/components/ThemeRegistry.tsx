'use client';

import * as React from 'react';
import { ServiceLayout } from '@nagiyu/ui';

interface ThemeRegistryProps {
  children: React.ReactNode;
  version: string;
}

export default function ThemeRegistry({ children, version }: ThemeRegistryProps) {
  return (
    <ServiceLayout
      headerProps={{ title: 'Share Together', ariaLabel: 'Share Together ホームページに戻る' }}
      footerProps={{ version }}
    >
      {children}
    </ServiceLayout>
  );
}
