'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/client-logger';

export default function ClientErrorReporter() {
  useEffect(() => {
    function handleError(event: ErrorEvent) {
      reportClientError(
        'error',
        '未捕捉例外',
        event.message || '不明なエラー',
        {
          screen: 'global',
          filename: event.filename,
          lineno: event.lineno,
        },
        // クロスオリジンの "Script error." では event.error が null になり、例外の値が無い
        event.error != null ? { error: event.error } : undefined
      );
    }

    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      const message =
        event.reason instanceof Error
          ? event.reason.message
          : String(event.reason ?? '不明な Promise rejection');

      reportClientError(
        'error',
        '未処理の Promise rejection',
        message,
        { screen: 'global' },
        { error: event.reason }
      );
    }

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return null;
}
