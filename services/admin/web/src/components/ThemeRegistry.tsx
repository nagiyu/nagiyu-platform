'use client';

import * as React from 'react';
import ServiceLayout from '@nagiyu/ui/service-layout';

interface ThemeRegistryProps {
  children: React.ReactNode;
  version?: string;
}

export default function ThemeRegistry({ children, version = '1.0.0' }: ThemeRegistryProps) {
  return (
    <ServiceLayout
      headerProps={{ title: 'Admin', ariaLabel: 'Admin ホームページに戻る' }}
      footerProps={{ version }}
    >
      {children}
    </ServiceLayout>
  );
}
