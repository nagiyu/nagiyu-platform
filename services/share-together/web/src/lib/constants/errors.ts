import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';

/**
 * エラーメッセージ定数
 *
 * 汎用メッセージは `@nagiyu/common` の COMMON_ERROR_MESSAGES を踏襲し、
 * share-together 固有のメッセージのみを追加する。
 */
export const ERROR_MESSAGES = {
  ...COMMON_ERROR_MESSAGES,

  CONFLICT: 'データの競合が発生しました',

  TODO_TITLE_INVALID: 'ToDoのタイトルは1〜200文字で入力してください',
  LIST_NAME_INVALID: 'リスト名は1〜100文字で入力してください',
  PERSONAL_LIST_LIMIT_EXCEEDED: '個人リストは100件まで作成できます',
  DYNAMODB_TABLE_NAME_REQUIRED: '環境変数 DYNAMODB_TABLE_NAME の設定が必要です',
  OWNER_ONLY: 'この操作はオーナーのみ実行できます',
  OWNER_CANNOT_LEAVE: 'オーナーはグループを脱退できません',
  ALREADY_INVITED: '既に招待済みです',
  ALREADY_MEMBER: '既にグループメンバーです',
  MEMBER_LIMIT_EXCEEDED: 'グループメンバーは最大5名です',
  INVITEE_EMAIL_NOT_REGISTERED: 'このメールアドレスのユーザーは登録されていません',
  INVITEE_USER_NOT_FOUND: '招待先のユーザーが見つかりません',
  INVALID_EMAIL_FORMAT: 'メールアドレスの形式が正しくありません',
  INVITATION_SEND_FAILED: '招待の送信に失敗しました。',
  ALREADY_RESPONDED: 'この招待には既に応答済みです',
  INVALID_INVITATION_STATUS: '招待のステータスが不正です',
} as const;
