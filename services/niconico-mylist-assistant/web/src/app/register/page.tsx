import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import RegisterPageClient from '@/components/RegisterPageClient';

interface RegisterPageProps {
  searchParams: Promise<{ jobId?: string }>;
}

/**
 * マイリスト登録ページ
 *
 * 条件を指定してマイリストに動画を自動登録し、ジョブステータスを表示します。
 * Issue 5-5 でフォーム実装後、このページに統合されます。
 */
export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const session = await getSession();

  if (!session?.user) {
    redirect('/');
  }

  const params = await searchParams;
  const jobId = params.jobId;

  return <RegisterPageClient jobId={jobId} />;
}
