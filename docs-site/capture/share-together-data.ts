/**
 * share-together の撮影用データ。画面に出る値をすべてここで決め、毎回同じ画像になるようにする。
 * 初期データの形は、サービスの E2E が `/api/test/reset` に渡すものと同じ。
 */

/** SKIP_AUTH_CHECK=true のときにサービスが使う固定の利用者 ID */
export const TEST_USER_ID = 'test-user-id';
/** テスト用セッションの利用者名。サービス起動時の環境変数と、シードの名前を同じにする */
export const TEST_USER_NAME = '山田 太郎';
export const TEST_USER_EMAIL = 'test@example.com';

export const DEFAULT_LIST_ID = 'list-default';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 招待日時として画面に出す固定の時刻 (2026-02-27 12:15 JST) */
export const INVITED_AT = Date.parse('2026-02-27T03:15:00Z');

export interface SeedUser {
  userId: string;
  email: string;
  name: string;
  defaultListId: string;
}

const user = (userId: string, name: string, email: string): SeedUser => ({
  userId,
  email,
  name,
  defaultListId: `${userId}-default`,
});

export const ME: SeedUser = {
  userId: TEST_USER_ID,
  email: TEST_USER_EMAIL,
  name: TEST_USER_NAME,
  defaultListId: DEFAULT_LIST_ID,
};
export const SATO = user('user-sato', '佐藤 花子', 'sato@example.com');
export const SUZUKI = user('user-suzuki', '鈴木 一郎', 'suzuki@example.com');
export const TAKAHASHI = user('user-takahashi', '高橋 美咲', 'takahashi@example.com');
export const ITO = user('user-ito', '伊藤 健', 'ito@example.com');
export const WATANABE = user('user-watanabe', '渡辺 優', 'watanabe@example.com');
/** まだグループに招待していない、登録済みの利用者 (招待の成功例に使う) */
export const NAKAMURA = user('user-nakamura', '中村 直樹', 'nakamura@example.com');

const ALL_USERS = [ME, SATO, SUZUKI, TAKAHASHI, ITO, WATANABE, NAKAMURA];

const personalList = (user: SeedUser) => ({
  listId: user.defaultListId,
  userId: user.userId,
  name: 'デフォルトリスト',
  isDefault: true,
});

/** `/api/test/reset` に渡す初期データ。形は E2E のヘルパー (`resetTestData`) と同じ */
type Seed = Partial<
  Record<'users' | 'personalLists' | 'groups' | 'memberships' | 'groupLists' | 'todos', unknown[]>
>;

type Role = 'OWNER' | 'MEMBER';

const member = (groupId: string, user: SeedUser, role: Role = 'MEMBER') => ({
  groupId,
  userId: user.userId,
  role,
  status: 'ACCEPTED' as const,
});

const invitation = (groupId: string, invitedBy: SeedUser, expiresAt: number) => ({
  groupId,
  userId: TEST_USER_ID,
  role: 'MEMBER' as const,
  status: 'PENDING' as const,
  invitedBy: invitedBy.userId,
  invitedAt: INVITED_AT,
  expiresAt,
});

const todo = (
  listId: string,
  order: number,
  title: string,
  isCompleted = false,
  by = TEST_USER_ID
) => ({
  // 並びは作成日時 → ID の順で決まるため、ID の昇順を表示したい順にそろえる
  todoId: `${listId}-todo-${String(order).padStart(2, '0')}`,
  listId,
  title,
  isCompleted,
  createdBy: by,
  ...(isCompleted ? { completedBy: by } : {}),
});

const groupList = (groupId: string, order: number, name: string) => ({
  listId: `${groupId}-list-${String(order).padStart(2, '0')}`,
  groupId,
  name,
  createdBy: TEST_USER_ID,
});

export const FAMILY_GROUP_ID = 'group-family';
export const TRIP_GROUP_ID = 'group-trip';
export const FULL_GROUP_ID = 'group-full';
export const READING_GROUP_ID = 'group-reading';

export const SHOPPING_LIST_ID = 'list-shopping';
export const WORK_LIST_ID = 'list-work';

const FAMILY_SHOPPING = `${FAMILY_GROUP_ID}-list-01`;
const FAMILY_CHORES = `${FAMILY_GROUP_ID}-list-02`;
const TRIP_PLAN = `${TRIP_GROUP_ID}-list-01`;

/** 個人リストの ToDo (完了済みと未完了が混ざる) */
const PERSONAL_TODOS = [
  todo(DEFAULT_LIST_ID, 1, '歯医者の予約を入れる'),
  todo(DEFAULT_LIST_ID, 2, '確定申告の書類をそろえる', true),
  todo(DEFAULT_LIST_ID, 3, '図書館の本を返す'),
  todo(SHOPPING_LIST_ID, 1, '牛乳'),
  todo(SHOPPING_LIST_ID, 2, '食パン', true),
  todo(WORK_LIST_ID, 1, '週次レポートを提出する'),
];

const GROUP_TODOS = [
  todo(FAMILY_SHOPPING, 1, '卵を 10 個買う', false, SATO.userId),
  todo(FAMILY_SHOPPING, 2, 'トイレットペーパー', true, ME.userId),
  todo(FAMILY_SHOPPING, 3, '洗剤の詰め替え', false, ME.userId),
  todo(FAMILY_CHORES, 1, '燃えるごみを出す', false, SATO.userId),
  todo(TRIP_PLAN, 1, '宿を予約する', true, SUZUKI.userId),
  todo(TRIP_PLAN, 2, '新幹線の切符を取る', false, ME.userId),
];

/** 自分がオーナーのグループ (家族) と、メンバーとして入っているグループ (旅行) を持つ基本のデータ */
export function buildFullSeed(): Seed {
  return {
    users: ALL_USERS,
    personalLists: [
      ...ALL_USERS.map(personalList),
      {
        listId: SHOPPING_LIST_ID,
        userId: TEST_USER_ID,
        name: '買い物',
        isDefault: false,
      },
      {
        listId: WORK_LIST_ID,
        userId: TEST_USER_ID,
        name: '仕事',
        isDefault: false,
      },
    ],
    groups: [
      { groupId: FAMILY_GROUP_ID, name: '家族', ownerUserId: TEST_USER_ID },
      { groupId: TRIP_GROUP_ID, name: '旅行計画', ownerUserId: SUZUKI.userId },
    ],
    memberships: [
      member(FAMILY_GROUP_ID, ME, 'OWNER'),
      member(FAMILY_GROUP_ID, SATO),
      member(FAMILY_GROUP_ID, SUZUKI),
      member(TRIP_GROUP_ID, SUZUKI, 'OWNER'),
      member(TRIP_GROUP_ID, ME),
      member(TRIP_GROUP_ID, TAKAHASHI),
    ],
    groupLists: [
      groupList(FAMILY_GROUP_ID, 1, '買い物'),
      groupList(FAMILY_GROUP_ID, 2, '家事'),
      groupList(TRIP_GROUP_ID, 1, '旅行の準備'),
    ],
    todos: [...PERSONAL_TODOS, ...GROUP_TODOS],
  };
}

/** ToDo が 1 件もない個人リストだけのデータ */
export function buildEmptySeed(): Seed {
  return {
    users: [ME],
    personalLists: [personalList(ME)],
  };
}

/** 自分の個人リストと、グループに属さない状態 */
export function buildNoGroupSeed(): Seed {
  return {
    users: ALL_USERS,
    personalLists: [personalList(ME), ...[SATO, SUZUKI].map(personalList)],
    todos: PERSONAL_TODOS.filter((t) => t.listId === DEFAULT_LIST_ID),
  };
}

/** グループには入っているが、共有リストが 1 件もない状態 */
export function buildNoGroupListSeed(): Seed {
  return {
    users: ALL_USERS,
    personalLists: ALL_USERS.map(personalList),
    groups: [{ groupId: FAMILY_GROUP_ID, name: '家族', ownerUserId: TEST_USER_ID }],
    memberships: [member(FAMILY_GROUP_ID, ME, 'OWNER'), member(FAMILY_GROUP_ID, SATO)],
  };
}

/** 個人リストが上限 (100 件) に達した状態。デフォルトリストを含めて 100 件 */
export function buildPersonalListLimitSeed(): Seed {
  const lists = Array.from({ length: 99 }, (_, i) => ({
    listId: `list-extra-${String(i + 1).padStart(3, '0')}`,
    userId: TEST_USER_ID,
    name: `リスト ${i + 1}`,
    isDefault: false,
  }));
  return {
    users: [ME],
    personalLists: [personalList(ME), ...lists],
    todos: PERSONAL_TODOS.filter((t) => t.listId === DEFAULT_LIST_ID),
  };
}

/** 自分がオーナーで、承認済みのメンバーが上限 (5 名) に達したグループ */
export function buildFullGroupSeed(): Seed {
  return {
    users: ALL_USERS,
    personalLists: ALL_USERS.map(personalList),
    groups: [{ groupId: FULL_GROUP_ID, name: '町内会', ownerUserId: TEST_USER_ID }],
    memberships: [
      member(FULL_GROUP_ID, ME, 'OWNER'),
      member(FULL_GROUP_ID, SATO),
      member(FULL_GROUP_ID, SUZUKI),
      member(FULL_GROUP_ID, TAKAHASHI),
      member(FULL_GROUP_ID, ITO),
    ],
    groupLists: [groupList(FULL_GROUP_ID, 1, '回覧板')],
  };
}

/**
 * 招待が 2 件届いている状態。
 * 期限は実行時刻から見た 1 日先にする (期限切れの招待は一覧から除かれるため)
 */
export function buildInvitationSeed(): Seed {
  const expiresAt = Date.now() + DAY_MS;
  return {
    users: ALL_USERS,
    personalLists: ALL_USERS.map(personalList),
    groups: [
      { groupId: READING_GROUP_ID, name: '読書会', ownerUserId: SATO.userId },
      { groupId: TRIP_GROUP_ID, name: '旅行計画', ownerUserId: SUZUKI.userId },
    ],
    memberships: [
      member(READING_GROUP_ID, SATO, 'OWNER'),
      member(TRIP_GROUP_ID, SUZUKI, 'OWNER'),
      invitation(READING_GROUP_ID, SATO, expiresAt),
      invitation(TRIP_GROUP_ID, SUZUKI, expiresAt),
    ],
  };
}

/** 承認しようとしたグループの承認済みメンバーがすでに 5 名いる、招待が届いた状態 */
export function buildInvitationToFullGroupSeed(): Seed {
  const expiresAt = Date.now() + DAY_MS;
  return {
    users: ALL_USERS,
    personalLists: ALL_USERS.map(personalList),
    groups: [{ groupId: FULL_GROUP_ID, name: '町内会', ownerUserId: SATO.userId }],
    memberships: [
      member(FULL_GROUP_ID, SATO, 'OWNER'),
      member(FULL_GROUP_ID, SUZUKI),
      member(FULL_GROUP_ID, TAKAHASHI),
      member(FULL_GROUP_ID, ITO),
      member(FULL_GROUP_ID, WATANABE),
      invitation(FULL_GROUP_ID, SATO, expiresAt),
    ],
  };
}

/** 招待一覧に出す招待日時を、実行ごとに変わる値から固定の値へ差し替える */
export function pinInvitationCreatedAt(body: {
  data?: { invitations?: Array<{ groupName: string; createdAt: number }> };
}): void {
  const invitations = body.data?.invitations;
  if (!invitations) return;
  invitations.sort((a, b) => a.groupName.localeCompare(b.groupName, 'ja'));
  invitations.forEach((invitation) => {
    invitation.createdAt = INVITED_AT;
  });
}
