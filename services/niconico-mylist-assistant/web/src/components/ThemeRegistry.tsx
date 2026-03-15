'use client';

import * as React from 'react';
import { ServiceLayout } from '@nagiyu/ui';
import { Navigation } from './Navigation';

interface ThemeRegistryProps {
  children: React.ReactNode;
  version?: string;
}

export default function ThemeRegistry({ children, version = '0.1.0' }: ThemeRegistryProps) {
  return (
    <ServiceLayout headerSlot={<Navigation />} footerProps={{ version }}>
      {children}
    </ServiceLayout>
  );
}
