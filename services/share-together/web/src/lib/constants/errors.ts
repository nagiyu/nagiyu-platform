export const ERROR_MESSAGES = {
  UNAUTHORIZED: '認証が必要です',
  FORBIDDEN: 'アクセス権限がありません',
  NOT_FOUND: '対象のデータが見つかりません',
  VALIDATION_ERROR: '入力内容が不正です',
  CONFLICT: 'データの競合が発生しました',
  INTERNAL_SERVER_ERROR: 'サーバーエラーが発生しました',

  DEFAULT_LIST_NOT_DELETABLE: 'デフォルトリストは削除できません',
  OWNER_ONLY: 'この操作はオーナーのみ実行できます',
  OWNER_CANNOT_LEAVE: 'オーナーはグループを脱退できません',
  ALREADY_INVITED: '既に招待済みです',
  ALREADY_MEMBER: '既にグループメンバーです',
  ALREADY_RESPONDED: 'この招待には既に応答済みです',
} as const;
