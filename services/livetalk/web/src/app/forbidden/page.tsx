'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AccessDeniedView } from '@nagiyu/ui';
import { getOrigin } from '../../lib/navigation';

/**
 * `from` クエリパラメータを読み取り、callbackUrl を解決するコンポーネント。
 *
 * `useSearchParams` は Suspense 境界でラップする必要があるため、親の
 * ForbiddenPage から分離している。
 */
function ForbiddenContent({ resolveOrigin = getOrigin }: { resolveOrigin?: () => string }) {
  const searchParams = useSearchParams();
  const [callbackUrl, setCallbackUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    const from = searchParams.get('from');
    const origin = resolveOrigin();
    if (from) {
      // `from` は pathname（例: "/notes"）のため、origin と結合して絶対 URL にする
      setCallbackUrl(`${origin}${from}`);
    } else {
      // `from` 未指定時はサービスのトップ（origin）を戻り先とする
      setCallbackUrl(origin);
    }
  }, [searchParams, resolveOrigin]);

  return (
    <AccessDeniedView authUrl={process.env.NEXT_PUBLIC_AUTH_URL ?? ''} callbackUrl={callbackUrl} />
  );
}

/**
 * 403（権限なし）時の導線付きページ（/forbidden）。
 *
 * ミドルウェアが認証済みユーザーの権限不足を検出したとき、このページへリダイレクトする。
 * `from` クエリパラメータには元のパス（pathname + search）が格納される。
 * ユーザーは「アクセスを更新」または「再ログイン」で権限取得後の利用再開が可能。
 *
 * `useSearchParams` を使うため Suspense 境界でラップしている。
 */
export default function ForbiddenPage() {
  return (
    <Suspense>
      <ForbiddenContent />
    </Suspense>
  );
}
