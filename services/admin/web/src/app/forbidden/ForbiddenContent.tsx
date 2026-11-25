'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AccessDeniedView } from '@nagiyu/ui';
import { getOrigin } from '../../lib/navigation';

/**
 * `from` クエリパラメータを読み取り、callbackUrl を解決するコンポーネント。
 *
 * `useSearchParams` は Suspense 境界でラップする必要があるため、親の
 * ForbiddenView から分離している。
 *
 * authUrl はサーバーコンポーネント（page.tsx）でランタイム env から解決して
 * prop として受け取る。client component 内で process.env.NEXT_PUBLIC_AUTH_URL を
 * 参照するとビルド時にクライアントバンドルへ空文字がインライン化され、
 * AccessDeniedView の「アクセスを更新」「再ログイン」導線が相対 URL になって
 * 失敗するため（page.tsx のサインアウトと同根の問題）。
 */
function ForbiddenContent({
  authUrl,
  resolveOrigin = getOrigin,
}: {
  authUrl: string;
  resolveOrigin?: () => string;
}) {
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

  return <AccessDeniedView authUrl={authUrl} callbackUrl={callbackUrl} />;
}

/**
 * /forbidden ページのクライアント本体。
 *
 * `useSearchParams` を使うため Suspense 境界でラップしている。
 * authUrl はサーバーコンポーネント（page.tsx）から prop で受け取る。
 */
export function ForbiddenView({ authUrl }: { authUrl: string }) {
  return (
    <Suspense>
      <ForbiddenContent authUrl={authUrl} />
    </Suspense>
  );
}
