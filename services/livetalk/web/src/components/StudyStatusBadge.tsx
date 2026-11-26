'use client';

import { Chip } from '@nagiyu/ui';
import { buildStudyBadge } from '@/lib/study/study-badge';
import { useStudyStatus } from '@/lib/study/useStudyStatus';

export interface StudyStatusBadgeProps {
  /**
   * auth サービスのベース URL。プランの画面への遷移先に使う。
   * client component 内で process.env.NEXT_PUBLIC_AUTH_URL を参照するとビルド時インライン化で
   * 空文字になるため、サーバーコンポーネントで解決して渡す。
   */
  authUrl: string;
}

/**
 * 勉強の状態を示す小さな札。お試し中は残り日数、お試しのあとは「勉強はお休み中」を出し、
 * 後者はプランの画面へのリンクにする。出さない状態や取得失敗のときは何も描かない。
 */
export default function StudyStatusBadge({ authUrl }: StudyStatusBadgeProps) {
  const status = useStudyStatus();
  const badge = status ? buildStudyBadge(status, authUrl) : null;
  if (!badge) return null;

  if (badge.href) {
    return (
      <Chip size="sm" color={badge.color} asChild data-testid="study-status-badge">
        <a href={badge.href}>{badge.label}</a>
      </Chip>
    );
  }
  return (
    <Chip size="sm" color={badge.color} data-testid="study-status-badge">
      {badge.label}
    </Chip>
  );
}
