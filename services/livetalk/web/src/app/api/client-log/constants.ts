export const CLIENT_LOG_ERROR_MESSAGES = {
  INVALID_REQUEST: 'リクエスト形式が不正です',
  INTERNAL_ERROR: '内部エラーが発生しました',
} as const;

export const CLIENT_LOG_ALLOWED_SEVERITIES = ['warning', 'error', 'critical'] as const;
export const CLIENT_LOG_MAX_TITLE_LENGTH = 200;
export const CLIENT_LOG_MAX_MESSAGE_LENGTH = 1000;
