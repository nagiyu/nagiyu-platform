import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import JobStatusPageClient from '@/components/JobStatusPageClient';

interface JobStatusPageProps {
  params: Promise<{ jobId: string }>;
}

/**
 * ジョブステータス表示ページ
 *
 * バッチジョブのステータスをリアルタイムで表示します。
 */
export default async function JobStatusPage({ params }: JobStatusPageProps) {
  const session = await getSession();

  if (!session?.user) {
    redirect('/');
  }

  const { jobId } = await params;

  return <JobStatusPageClient jobId={jobId} />;
}
