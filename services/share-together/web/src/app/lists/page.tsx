import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { PersonalListsResponse } from '@/types';

export const dynamic = 'force-dynamic';

const ERROR_MESSAGES = {
  PERSONAL_LISTS_FETCH_FAILED: '個人リスト一覧の取得に失敗しました',
  API_RESPONSE_STATUS_ERROR: 'APIレスポンスのステータスが異常です',
} as const;

async function resolveDefaultListId(): Promise<string | null> {
  try {
    const requestHeaders = await headers();
    const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
    if (!host) {
      return null;
    }

    const protocol = requestHeaders.get('x-forwarded-proto') ?? 'http';
    const response = await fetch(`${protocol}://${host}/api/lists`, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`${ERROR_MESSAGES.API_RESPONSE_STATUS_ERROR}: ${response.status}`);
    }

    const result = (await response.json()) as PersonalListsResponse;
    const defaultListId = result.data.lists.find((list) => list.isDefault)?.listId;
    return defaultListId ?? null;
  } catch (error: unknown) {
    console.error(ERROR_MESSAGES.PERSONAL_LISTS_FETCH_FAILED, { error });
    return null;
  }
}

export default async function ListsPage() {
  const defaultListId = await resolveDefaultListId();
  if (!defaultListId) {
    return notFound();
  }

  redirect(`/lists/${defaultListId}`);
}
