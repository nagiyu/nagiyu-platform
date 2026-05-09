'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { isRecordablePath, saveLastVisitedPath } from '@/lib/lastVisitedPath';

export default function LastVisitedPathTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || !isRecordablePath(pathname)) {
      return;
    }
    saveLastVisitedPath(pathname);
  }, [pathname]);

  return null;
}
