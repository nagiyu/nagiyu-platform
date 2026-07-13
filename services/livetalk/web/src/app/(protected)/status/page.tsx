/**
 * /status — livetalk:admin 権限保持者向けデバッグパネル（L3 生データ表示）
 *
 * 通知が来ない理由（正常 / 異常）を外部から一目で判別するための運用支援ページ。
 * Issue #3363
 */

import { redirect } from 'next/navigation';
import { Box, Container, Divider, Typography } from '@mui/material';
import { Chip } from '@nagiyu/ui';
import { hasPermission } from '@nagiyu/common';
import {
  DEFAULT_CHARACTER_ID,
  LIFECYCLE_DEFAULT_BEDTIME,
  LIFECYCLE_DEFAULT_WAKE_UP_TIME,
  NOTIFY_BACKOFF_BASE,
  NOTIFY_RECENT_SESSION_SAMPLE_N,
  NOTIFY_SESSION_GAP_MINUTES,
  SAFETY_REVIEW_DEFAULT_LIMIT,
  resolveLifecycleState,
  shouldNotifyNow,
  extractSessionStartTimes,
  computeSessionIntervals,
  computeBaseIntervalMs,
  computeIntensityFactor,
  type MessageEntity,
  type NotificationEventEntity,
  type SafetyEventSummary,
} from '@nagiyu/livetalk-core';
import { getSession } from '@/lib/server/session';
import {
  getLifecycleRepository,
  getNotificationEventRepository,
  getStudyTopicRepository,
  getMessageRepository,
} from '@/lib/server/repositories';
import { getSafetyEventRepository } from '@/lib/server/safety';
import {
  hasCharacter,
  getRegisteredCharacterIds,
  getCharacterDisplay,
} from '@/lib/characters/registry';
import StatusCharacterSwitcher from '@/components/StatusCharacterSwitcher';
import StatusTestPush from '@/components/StatusTestPush';

const JST = 'Asia/Tokyo';

function formatJst(ms: number): string {
  return new Date(ms).toLocaleString('ja-JP', { timeZone: JST });
}

function computeNextEarliestAt(
  userMessages: Pick<MessageEntity, 'CreatedAt'>[],
  notificationEvents: NotificationEventEntity[],
  now: Date
): number {
  const sessionGapMs = NOTIFY_SESSION_GAP_MINUTES * 60 * 1000;
  const sessionStarts = extractSessionStartTimes(userMessages, sessionGapMs);
  const intervals = computeSessionIntervals(sessionStarts, NOTIFY_RECENT_SESSION_SAMPLE_N);
  // 強度係数を反映（decision.ts と同じロジックでミラーする）
  const intensityFactor = computeIntensityFactor(sessionStarts, now);
  const baseIntervalMs = computeBaseIntervalMs(intervals, intensityFactor);

  const lastNormalAt = notificationEvents.find((e) => e.Kind === 'normal')?.CreatedAt ?? 0;
  const lastInteractionAt =
    userMessages.length > 0 ? Math.max(...userMessages.map((m) => m.CreatedAt)) : 0;
  const referenceTime = Math.max(lastInteractionAt, lastNormalAt);

  const missedCount = notificationEvents.filter(
    (e) => e.Kind === 'normal' && e.CreatedAt > lastInteractionAt
  ).length;

  return referenceTime + baseIntervalMs * Math.pow(NOTIFY_BACKOFF_BASE, missedCount);
}

const REASON_LABELS: Record<string, string> = {
  not_due: 'インターバル未経過',
  outside_window: '活動時間帯外',
  sleeping: '睡眠帯',
  daily_cap: '本日の上限到達',
  inactive_stopped: '長期不在（通知停止）',
  no_content: 'コンテンツなし',
};

/** セーフティ検出の Trigger を日本語ラベルに変換する */
const SAFETY_TRIGGER_LABELS: Record<string, string> = {
  input_keyword: 'キーワード検出',
  output_moderation: 'Moderation',
};

interface StatusPageProps {
  searchParams: Promise<{ characterId?: string }>;
}

export default async function StatusPage({ searchParams }: StatusPageProps) {
  const session = await getSession();

  if (!session || !hasPermission(session.user.roles, 'livetalk:admin')) {
    redirect('/');
  }

  const { characterId: queriedId } = await searchParams;
  const characterId = queriedId && hasCharacter(queriedId) ? queriedId : DEFAULT_CHARACTER_ID;
  const userId = session.user.googleId;
  const now = new Date();

  const [lifecycle, notificationEvents, allMessages, studyPending, recentSafetyEvents] =
    await Promise.all([
      getLifecycleRepository().get({ userId, characterId }),
      getNotificationEventRepository().listByUser(userId, 10),
      getMessageRepository().listSince(userId, characterId, 0),
      getStudyTopicRepository().listByStatus(userId, characterId, 'pending'),
      getSafetyEventRepository().listRecent(SAFETY_REVIEW_DEFAULT_LIMIT),
    ]);

  const bedtime = lifecycle?.Bedtime ?? LIFECYCLE_DEFAULT_BEDTIME;
  const wakeUpTime = lifecycle?.WakeUpTime ?? LIFECYCLE_DEFAULT_WAKE_UP_TIME;
  const state = resolveLifecycleState(now, bedtime, wakeUpTime);
  const userMessages = allMessages.filter((m) => m.Role === 'user');

  const lifecycleForDecision = lifecycle ?? {
    UserID: userId,
    CharacterID: characterId,
    Bedtime: LIFECYCLE_DEFAULT_BEDTIME,
    WakeUpTime: LIFECYCLE_DEFAULT_WAKE_UP_TIME,
    CreatedAt: 0,
    UpdatedAt: 0,
  };

  const notifyDecision = shouldNotifyNow({
    userMessages,
    lifecycle: lifecycleForDecision,
    notificationEvents,
    now,
  });

  let nextEarliestAt: number | undefined;
  if (!notifyDecision.notify && notifyDecision.reason === 'not_due') {
    nextEarliestAt = computeNextEarliestAt(userMessages, notificationEvents, now);
  }

  const recentNotifications = notificationEvents.slice(0, 5);

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
      {lifecycle?.UserActivityProfile ? (
        <Box sx={{ mb: 1 }}>
          <Typography variant="body2">
            活動プロファイル: 朝 {lifecycle.UserActivityProfile.morningPeak} / 夕{' '}
            {lifecycle.UserActivityProfile.eveningPeak}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            サンプル {lifecycle.UserActivityProfile.sampleSize} 件 / 最終学習:{' '}
            {lifecycle.UserActivityProfile.lastLearnedAt}
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
              インターバル解除予測: {formatJst(nextEarliestAt)}（活動窓・睡眠帯は別途）
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
              key={e.NotifID}
              sx={{ mb: 1, pl: 1, borderLeft: '2px solid', borderColor: 'divider' }}
            >
              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                {formatJst(e.CreatedAt)} | {e.Kind} |{' '}
                {e.ConsumedAt ? `消化済み ${formatJst(e.ConsumedAt)}` : '未消化'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                {e.Body.slice(0, 100)}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      <Divider sx={{ my: 1.5 }} />

      {/* コンテンツ */}
      <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 'bold' }}>
        コンテンツ
      </Typography>
      <Typography variant="body2">STUDY_TOPIC (pending): {studyPending.length} 件</Typography>

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
            const characterDisplay = e.CharacterID
              ? (() => {
                  try {
                    return getCharacterDisplay(e.CharacterID).displayName;
                  } catch {
                    return e.CharacterID;
                  }
                })()
              : '—';

            return (
              <Box
                key={e.EventID}
                sx={{ mb: 1, pl: 1, borderLeft: '2px solid', borderColor: 'divider' }}
              >
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                  {formatJst(e.CreatedAt)} | {SAFETY_TRIGGER_LABELS[e.Trigger] ?? e.Trigger} |
                  キャラ: {characterDisplay}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                  {e.DetectedPattern}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                  ユーザー: {e.UserID}
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}
    </Container>
  );
}
