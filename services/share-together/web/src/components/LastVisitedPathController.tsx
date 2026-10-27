'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  SESSION_BOOTSTRAP_STORAGE_KEY,
  buildVisitedPath,
  isRecordablePath,
  loadLastVisitedPath,
  saveLastVisitedPath,
} from '@/lib/lastVisitedPath';

const ROOT_PATH = '/';

export default function LastVisitedPathController() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? '';

  useEffect(() => {
    if (!pathname || !isRecordablePath(pathname)) {
      return;
    }

    const isFirstEffectInSession =
      window.sessionStorage.getItem(SESSION_BOOTSTRAP_STORAGE_KEY) === null;

    if (isFirstEffectInSession) {
      window.sessionStorage.setItem(SESSION_BOOTSTRAP_STORAGE_KEY, '1');

      // セッション初回かつトップ着地のみ、前回値で復元する。
      // ここでは保存しないことで「先に書き込んで前回値を上書き」という競合を回避する。
      // 復元後の pathname 変化で次の effect が新しいパスを保存する。
      if (pathname === ROOT_PATH) {
        const lastPath = loadLastVisitedPath();
        if (lastPath && lastPath !== ROOT_PATH && isRecordablePath(lastPath)) {
          router.replace(lastPath);
          return;
        }
      }
    }

    saveLastVisitedPath(buildVisitedPath(pathname, search));
  }, [pathname, search, router]);

  return null;
}
