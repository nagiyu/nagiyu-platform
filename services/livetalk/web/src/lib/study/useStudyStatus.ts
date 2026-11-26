'use client';

import { useEffect, useState } from 'react';
import type { StudyStatus } from './types';

/**
 * マウント時に /api/study-status を取得して返す。
 * 取得に失敗したら null のままにする (札は会話の邪魔をしないよう、出さないだけにする)。
 */
export function useStudyStatus(): StudyStatus | null {
  const [status, setStatus] = useState<StudyStatus | null>(null);

  useEffect(() => {
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
  }, []);

  return status;
}
