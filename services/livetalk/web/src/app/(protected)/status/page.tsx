/**
 * /status — livetalk:admin 権限保持者向けデバッグパネル（L3 生データ表示）
 *
 * 通知が来ない理由（正常 / 異常）を外部から一目で判別するための運用支援ページ。
 * Issue #3363
 */

import { redirect } from 'next/navigation';
import { Box, Container, Divider, Typography } from '@mui/material';
import { AccessDeniedView, Chip } from '@nagiyu/ui';
import { formatJstDateTime, hasPermission } from '@nagiyu/common';
import {
  DEFAULT_CHARACTER_ID,
  SAFETY_REVIEW_DEFAULT_LIMIT,
  type SafetyEventSummary,
  createSafetyEventRepository,
} from '@nagiyu/livetalk-core';
import { getSession } from '@/lib/server/session';
import { loadStatusSnapshot } from '@/lib/server/status';
import {
  hasCharacter,
  getRegisteredCharacterIds,
  getCharacterDisplay,
} from '@/lib/characters/registry';
import StatusCharacterSwitcher from '@/components/StatusCharacterSwitcher';
import StatusTestPush from '@/components/StatusTestPush';
import type { CriticalSkipReason, CriticalTopicSummary, StudyState } from '@/lib/server/status';

const REASON_LABELS: Record<string, string> = {
  not_due: 'インターバル未経過',
  outside_window: '活動時間帯外',
  sleeping: '睡眠帯',
  daily_cap: '本日の上限到達',
  inactive_stopped: '長期不在（通知停止）',
  no_content: 'コンテンツなし',
};

/** 勉強が止まっている理由のラベル。止まっていなければ「勉強中」 */
const STUDY_STATE_LABELS: Record<StudyState, string> = {
  no_lifecycle: '対象外（生活サイクル未登録）',
  paused: '勉強停止中（3 日ルール）',
  limit_reached: '本日の上限到達',
  studying: '勉強中',
};

/** 重要通知を判定しない理由のラベル */
const CRITICAL_SKIP_LABELS: Record<CriticalSkipReason, string> = {
  no_lifecycle: '判定しない（生活サイクル未登録）',
  study_paused: '判定しない（勉強停止中）',
};

/** セーフティ検出の Trigger を日本語ラベルに変換する */
const SAFETY_TRIGGER_LABELS: Record<string, string> = {
  input_keyword: 'キーワード検出',
  output_moderation: 'Moderation',
};

interface StatusPageProps {
  searchParams: Promise<{ characterId?: string }>;
}

/** 重要通知の判定に関わる話題の一覧。 */
function TopicList({ title, topics }: { title: string; topics: CriticalTopicSummary[] }) {
  return (
    <Box sx={{ mt: 0.5 }}>
      <Typography variant="body2">
        {title}: {topics.length === 0 ? 'なし' : `${topics.length} 件`}
      </Typography>
      {topics.map((t) => (
        <Typography
          key={t.topicId}
          variant="body2"
          color="text.secondary"
          sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
        >
          {t.topicId} | {t.subject} | care {t.care}
        </Typography>
      ))}
    </Box>
  );
}

export default async function StatusPage({ searchParams }: StatusPageProps) {
  const session = await getSession();

  if (!session) {
    redirect('/');
  }

  // NEXT_PUBLIC_AUTH_URL はビルド時インライン化を避けるため、サーバーのランタイム env から渡す
  if (!hasPermission(session.user.roles, 'livetalk:admin')) {
    return <AccessDeniedView authUrl={process.env.NEXT_PUBLIC_AUTH_URL ?? ''} />;
  }

  const { characterId: queriedId } = await searchParams;
  const characterId = queriedId && hasCharacter(queriedId) ? queriedId : DEFAULT_CHARACTER_ID;
  const userId = session.user.id;
  const now = new Date();

  const [snapshot, recentSafetyEvents] = await Promise.all([
    loadStatusSnapshot(userId, characterId, now),
    createSafetyEventRepository().listRecent(SAFETY_REVIEW_DEFAULT_LIMIT),
  ]);
  const { lifecycle, notifyDecision, nextEarliestAt, recentNotifications } = snapshot;
  const { state, bedtime, wakeUpTime } = lifecycle;
  const studyPendingCount = snapshot.studyTopicPendingCount;
  const { studyState, studyPause, studyUsage, freshnessCheckRequests, criticalCandidates } =
    snapshot;

  // テスト通知送信用: 登録キャラクターの表示名マップを構築する
  const registeredCharacterIds = getRegisteredCharacterIds();
  const characterDisplayNames = Object.fromEntries(
    registeredCharacterIds.map((id) => [id, getCharacterDisplay(id).displayName])
  );

  return (
    <Container maxWidth="sm" sx={{ py: 2 }}>
      <Typography variant="h6" component="h1" sx={{ mb: 2 }}>
        ステータス（デバッグ）
      </Typography>

      {/* キャラクター切替 */}
      <StatusCharacterSwitcher currentCharacterId={characterId} />

      {/* ライフサイクル */}
      <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 'bold' }}>
        ライフサイクル
      </Typography>
      <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="body2">状態:</Typography>
        <Chip size="sm" color={state === 'awake' ? 'success' : 'neutral'}>
          {state}
        </Chip>
      </Box>
      <Typography variant="body2" sx={{ mb: 0.5 }}>
        就寝: {bedtime} / 起床: {wakeUpTime}
      </Typography>
      {lifecycle.userActivityProfile ? (
        <Box sx={{ mb: 1 }}>
          <Typography variant="body2">
            活動プロファイル: 朝 {lifecycle.userActivityProfile.morningPeak} / 夕{' '}
            {lifecycle.userActivityProfile.eveningPeak}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            サンプル {lifecycle.userActivityProfile.sampleSize} 件 / 最終学習:{' '}
            {lifecycle.userActivityProfile.lastLearnedAt}
          </Typography>
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          活動プロファイル: 未学習（時間帯ゲートをスキップ中）
        </Typography>
      )}

      <Divider sx={{ my: 1.5 }} />

      {/* 通知判定 */}
      <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 'bold' }}>
        通知判定（現時刻）
      </Typography>
      {notifyDecision.notify ? (
        <Box sx={{ mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2">結果:</Typography>
            <Chip size="sm" color="success">
              通知可能 — {notifyDecision.kind}
            </Chip>
          </Box>
          {'toneBucket' in notifyDecision && (
            <Typography variant="body2" color="text.secondary">
              toneBucket: {notifyDecision.toneBucket}
            </Typography>
          )}
        </Box>
      ) : (
        <Box sx={{ mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2">結果:</Typography>
            <Chip size="sm" color="neutral">
              NG — {REASON_LABELS[notifyDecision.reason] ?? notifyDecision.reason}
            </Chip>
          </Box>
          {nextEarliestAt !== undefined && (
            <Typography variant="body2" color="text.secondary">
              インターバル解除予測: {formatJstDateTime(nextEarliestAt, { seconds: true })}
              （活動窓・睡眠帯は別途）
            </Typography>
          )}
        </Box>
      )}

      <Divider sx={{ my: 1.5 }} />

      {/* 直近通知履歴 */}
      <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 'bold' }}>
        直近通知履歴（最新 5 件）
      </Typography>
      {recentNotifications.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          履歴なし
        </Typography>
      ) : (
        <Box sx={{ mb: 1 }}>
          {recentNotifications.map((e) => (
            <Box
              key={e.notifId}
              sx={{ mb: 1, pl: 1, borderLeft: '2px solid', borderColor: 'divider' }}
            >
              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                {formatJstDateTime(e.createdAt, { seconds: true })} | {e.kind} |{' '}
                {e.consumedAt
                  ? `消化済み ${formatJstDateTime(e.consumedAt, { seconds: true })}`
                  : '未消化'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                {e.body.slice(0, 100)}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      <Divider sx={{ my: 1.5 }} />

      {/* 勉強と重要通知 */}
      <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 'bold' }}>
        勉強と重要通知
      </Typography>
      <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="body2">勉強:</Typography>
        <Chip size="sm" color={studyState === 'studying' ? 'success' : 'warning'}>
          {STUDY_STATE_LABELS[studyState]}
        </Chip>
      </Box>
      <Box sx={{ mb: 1 }}>
        <Typography variant="body2">
          3 日ルール: {studyPause.paused ? '止まっている' : '止まっていない'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          最後の発話:{' '}
          {studyPause.lastUserMessageAt !== null
            ? formatJstDateTime(studyPause.lastUserMessageAt, { seconds: true })
            : 'なし（直近 7 日）'}
        </Typography>
        {studyPause.pausesAt !== null && (
          <Typography variant="body2" color="text.secondary">
            {studyPause.paused ? '停止した時刻' : '停止する時刻'}:{' '}
            {formatJstDateTime(studyPause.pausesAt, { seconds: true })}
          </Typography>
        )}
      </Box>
      <Box sx={{ mb: 1 }}>
        <Typography variant="body2">本日の勉強の回数:</Typography>
        <Typography variant="body2" color="text.secondary">
          このキャラ: {studyUsage.characterCount} / {studyUsage.characterLimit} 回 （勉強中のキャラ{' '}
          {studyUsage.studyingCharacterCount} 人で等分）
        </Typography>
        <Typography variant="body2" color="text.secondary">
          全キャラ合計: {studyUsage.totalCount} / {studyUsage.totalLimit} 回
        </Typography>
      </Box>
      <Box sx={{ mb: 1 }}>
        <Typography variant="body2">
          鮮度確認の依頼待ち: {freshnessCheckRequests.count} 件
        </Typography>
        {freshnessCheckRequests.requests.map((r) => (
          <Typography
            key={r.topicId}
            variant="body2"
            color="text.secondary"
            sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
          >
            {r.topicId} | {formatJstDateTime(r.createdAt, { seconds: true })}
          </Typography>
        ))}
      </Box>
      <Box sx={{ mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2">重要通知の判定:</Typography>
          <Chip size="sm" color={criticalCandidates.skipReason === null ? 'success' : 'warning'}>
            {criticalCandidates.skipReason === null
              ? '判定する'
              : CRITICAL_SKIP_LABELS[criticalCandidates.skipReason]}
          </Chip>
        </Box>
        {criticalCandidates.evaluated && (
          <>
            <TopicList title="判定に渡る候補" topics={criticalCandidates.candidates} />
            <TopicList title="鮮度切れで外れた話題" topics={criticalCandidates.staleExcluded} />
          </>
        )}
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          送り済みの重要通知: {criticalCandidates.sentCriticals.length === 0 ? 'なし' : ''}
        </Typography>
        {criticalCandidates.sentCriticals.map((c) => (
          <Typography
            key={`${c.topicId}-${c.eventDate ?? ''}`}
            variant="body2"
            color="text.secondary"
            sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
          >
            {c.topicId} | 予定日: {c.eventDate ?? '記録なし'}
          </Typography>
        ))}
      </Box>

      <Divider sx={{ my: 1.5 }} />

      {/* コンテンツ */}
      <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 'bold' }}>
        コンテンツ
      </Typography>
      <Typography variant="body2">STUDY_TOPIC (pending): {studyPendingCount} 件</Typography>

      <Divider sx={{ my: 1.5 }} />

      {/* テスト通知送信（admin デバッグ用 — Issue #3491） */}
      <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 'bold' }}>
        テスト通知送信
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontSize: '0.75rem' }}>
        decision ゲートを介さず即時送信します。dev 検証専用。
      </Typography>
      <StatusTestPush characterIds={registeredCharacterIds} displayNames={characterDisplayNames} />

      <Divider sx={{ my: 1.5 }} />

      {/* セーフティ横断レビュー（ADR-2.22 / Issue #3580） */}
      <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 'bold' }}>
        セーフティ横断レビュー（直近 {SAFETY_REVIEW_DEFAULT_LIMIT} 件）
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontSize: '0.75rem' }}>
        全ユーザー横断で検出時刻の降順に一覧します。InputText / ResponseText は PII のため非表示。
      </Typography>
      {recentSafetyEvents.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          検出履歴なし
        </Typography>
      ) : (
        <Box sx={{ mb: 1 }}>
          {recentSafetyEvents.map((e: SafetyEventSummary) => {
            const characterDisplay = e.characterId
              ? (() => {
                  try {
                    return getCharacterDisplay(e.characterId).displayName;
                  } catch {
                    return e.characterId;
                  }
                })()
              : '—';

            return (
              <Box
                key={e.eventId}
                sx={{ mb: 1, pl: 1, borderLeft: '2px solid', borderColor: 'divider' }}
              >
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                  {formatJstDateTime(e.createdAt, { seconds: true })} |{' '}
                  {SAFETY_TRIGGER_LABELS[e.trigger] ?? e.trigger} | キャラ: {characterDisplay}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                  {e.detectedPattern}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                  ユーザー: {e.userId}
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}
    </Container>
  );
}
