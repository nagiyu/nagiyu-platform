import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';
import { ERROR_MESSAGES } from '@/lib/constants/errors';

describe('ERROR_MESSAGES', () => {
  it('共通エラーメッセージを取り込んでいる', () => {
    expect(ERROR_MESSAGES).toMatchObject(COMMON_ERROR_MESSAGES);
  });

  it('share-together 固有のエラーメッセージを日本語で提供する', () => {
    expect(ERROR_MESSAGES).toMatchObject({
      CONFLICT: 'データの競合が発生しました',
      USER_ID_REQUIRED: 'ユーザーIDは必須です',
      LIST_ID_REQUIRED: 'リストIDは必須です',
      TODO_ID_REQUIRED: 'ToDo IDは必須です',
      TODO_TITLE_INVALID: 'ToDoのタイトルは1〜200文字で入力してください',
      TODO_NOT_FOUND: 'ToDoが見つかりません',
      PERSONAL_LIST_NOT_FOUND: '個人リストが見つかりません',
      LIST_NAME_INVALID: 'リスト名は1〜100文字で入力してください',
      PERSONAL_LIST_LIMIT_EXCEEDED: '個人リストは100件まで作成できます',
      DYNAMODB_TABLE_NAME_REQUIRED: '環境変数 DYNAMODB_TABLE_NAME の設定が必要です',
      DEFAULT_LIST_NOT_DELETABLE: 'デフォルトリストは削除できません',
      OWNER_ONLY: 'この操作はオーナーのみ実行できます',
      OWNER_CANNOT_LEAVE: 'オーナーはグループを脱退できません',
      ALREADY_INVITED: '既に招待済みです',
      ALREADY_MEMBER: '既にグループメンバーです',
      MEMBER_LIMIT_EXCEEDED: 'グループメンバーは最大5名です',
      INVITATION_SEND_FAILED: '招待の送信に失敗しました。',
      ALREADY_RESPONDED: 'この招待には既に応答済みです',
      INVALID_INVITATION_STATUS: '招待のステータスが不正です',
    });
  });
});
