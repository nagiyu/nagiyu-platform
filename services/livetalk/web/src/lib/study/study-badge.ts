import type { StudyStatus } from './types';

/** 勉強の札の文言 */
export const STUDY_BADGE_MESSAGES = {
  TRIAL_PREFIX: 'お試し中 あと ',
  TRIAL_SUFFIX: ' 日',
  ENDED: '勉強はお休み中',
} as const;

/** auth のプランの画面のパス */
export const PLANS_PATH = '/plans';

/** 札の表示内容 */
export interface StudyBadge {
  label: string;
  color: 'neutral' | 'warning';
  /** 押したときに開く URL。無ければ押せない */
  href?: string;
}

/**
 * 状態から札の表示内容を決める。出さないときは null。
 *
 * @param status - 勉強の状態
 * @param authUrl - auth のベース URL。空のときは遷移先を決められないため、押せない札にする
 */
export function buildStudyBadge(status: StudyStatus, authUrl: string): StudyBadge | null {
  switch (status.state) {
    case 'trial':
      return {
        label: `${STUDY_BADGE_MESSAGES.TRIAL_PREFIX}${status.remainingDays}${STUDY_BADGE_MESSAGES.TRIAL_SUFFIX}`,
        color: 'neutral',
      };
    case 'ended':
      return {
        label: STUDY_BADGE_MESSAGES.ENDED,
        color: 'warning',
        ...(authUrl ? { href: `${authUrl}${PLANS_PATH}` } : {}),
      };
    default:
      return null;
  }
}
