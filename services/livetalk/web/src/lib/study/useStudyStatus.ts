'use client';

import { useEffect, useState } from 'react';
import type { StudyStatus } from './types';

/**
 * `enabled` が真になったときに /api/study-status を取得して返す。
 * お試しは最初の同意で始まるため、同意が済む前に取った状態は使えない。呼ぶ側は同意が済んでから
 * `enabled` を真にする。取得に失敗したら null のままにする (札は会話の邪魔をしないよう、出さないだけにする)。
 */
export function useStudyStatus(enabled: boolean): StudyStatus | null {
  const [status, setStatus] = useState<StudyStatus | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch('/api/study-status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: StudyStatus | null) => {
        if (!cancelled && data) setStatus(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return status;
}
