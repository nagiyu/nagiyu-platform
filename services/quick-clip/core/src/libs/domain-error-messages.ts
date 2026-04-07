export const DOMAIN_ERROR_MESSAGES = {
  JOB_ID_REQUIRED: 'ジョブIDは必須です',
  JOB_NOT_FOUND: 'ジョブが見つかりません',
  JOB_UPDATED_FETCH_FAILED: 'ジョブの更新後の取得に失敗しました',
  FILE_NAME_REQUIRED: 'ファイル名は必須です',
  FILE_SIZE_INVALID: 'ファイルサイズは0より大きい必要があります',
  ERROR_MESSAGE_REQUIRED: 'FAILEDステータスではエラーメッセージが必須です',
  HIGHLIGHT_ID_REQUIRED: '見どころIDは必須です',
  UPDATE_FIELDS_REQUIRED: '更新内容が指定されていません',
  SECOND_VALUE_INVALID: '開始時刻と終了時刻は0以上で指定してください',
  RANGE_INVALID: '開始時刻は終了時刻より小さくしてください',
  HIGHLIGHT_NOT_FOUND: '見どころが見つかりません',
  HIGHLIGHT_UPDATED_FETCH_FAILED: '見どころの更新後の取得に失敗しました',
} as const;
