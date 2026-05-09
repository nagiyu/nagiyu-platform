'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { isPersistablePath, saveLastVisitedPath } from '@/lib/lastVisitedPath';

export default function LastVisitedPathTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || !isPersistablePath(pathname)) {
      return;
    }
    saveLastVisitedPath(pathname);
  }, [pathname]);

  return null;
}
