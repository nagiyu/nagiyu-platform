import { ERROR_MESSAGES } from '@/lib/constants/errors';

describe('ERROR_MESSAGES', () => {
  it('主要なエラーメッセージを日本語で提供する', () => {
    expect(ERROR_MESSAGES).toEqual({
      UNAUTHORIZED: '認証が必要です',
      FORBIDDEN: 'アクセス権限がありません',
      NOT_FOUND: '対象のデータが見つかりません',
      VALIDATION_ERROR: '入力内容が不正です',
      CONFLICT: 'データの競合が発生しました',
      INTERNAL_SERVER_ERROR: 'サーバーエラーが発生しました',
      USER_ID_REQUIRED: 'ユーザーIDは必須です',
      LIST_ID_REQUIRED: 'リストIDは必須です',
      TODO_ID_REQUIRED: 'ToDo IDは必須です',
      TODO_TITLE_INVALID: 'ToDoのタイトルは1〜200文字で入力してください',
      UPDATE_FIELDS_REQUIRED: '更新内容が指定されていません',
      TODO_NOT_FOUND: 'ToDoが見つかりません',
      LIST_NAME_INVALID: 'リスト名は1〜100文字で入力してください',
      DYNAMODB_TABLE_NAME_REQUIRED: '環境変数 DYNAMODB_TABLE_NAME の設定が必要です',
      DEFAULT_LIST_NOT_DELETABLE: 'デフォルトリストは削除できません',
      OWNER_ONLY: 'この操作はオーナーのみ実行できます',
      OWNER_CANNOT_LEAVE: 'オーナーはグループを脱退できません',
      ALREADY_INVITED: '既に招待済みです',
      ALREADY_MEMBER: '既にグループメンバーです',
      INVITATION_SEND_FAILED: '招待の送信に失敗しました。',
      ALREADY_RESPONDED: 'この招待には既に応答済みです',
      INVALID_INVITATION_STATUS: '招待のステータスが不正です',
    });
  });
});
