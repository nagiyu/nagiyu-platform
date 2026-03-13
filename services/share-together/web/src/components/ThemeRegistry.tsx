'use client';

import * as React from 'react';
import { AppLayout } from '@nagiyu/ui';

interface ThemeRegistryProps {
  children: React.ReactNode;
}

export default function ThemeRegistry({ children }: ThemeRegistryProps) {
  return <AppLayout>{children}</AppLayout>;
}
