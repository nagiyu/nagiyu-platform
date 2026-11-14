/**
 * Role and Permission Definitions
 *
 * Defines all roles and their associated permissions for the nagiyu platform.
 * Roles are managed in code (not in database) to ensure version control and
 * easy deployment.
 *
 * Permission naming convention: {resource}:{action}
 * Examples: 'users:read', 'users:write', 'roles:assign'
 */

/**
 * Role definition structure
 */
interface RoleDefinition {
  /** Unique role identifier (kebab-case) */
  id: string;
  /** Human-readable role name (Japanese) */
  name: string;
  /** Description of the role's purpose and scope */
  description: string;
  /** Array of permissions granted to this role */
  permissions: string[];
  /**
   * 課金の権利 (RoleGrant) として付けられる有料ロールのときだけ持つ。
   * サービスと段の上下をロール ID の文字列解析に頼らず、この項目で決める
   */
  billing?: {
    /** 有料サービスの ID (BILLING_SERVICES のキー) */
    service: string;
    /** 段の順位。小さいほど下の段。上の段は下の段の権限を含む */
    rank: number;
  };
}

/**
 * 定義済みのすべてのロール
 *
 * 説明 (description) は管理画面のロール割り当てにそのまま表示されるため、
 * 権限 ID や項目名などの内部の用語を書かず、利用者の言葉で書く。
 * Use `as const` to enable type inference for role IDs
 */
export const ROLES = {
  admin: {
    id: 'admin',
    name: '管理者',
    description: 'ユーザーの管理、ロールの割り当て、お知らせの配信、エラーの閲覧ができる',
    permissions: [
      'users:read',
      'users:write',
      'roles:assign',
      'notifications:write',
      'errors:read',
    ],
  },
  'user-manager': {
    id: 'user-manager',
    name: 'ユーザー管理者',
    description: 'ユーザー管理のみ可能',
    permissions: ['users:read', 'users:write'],
  },
  'stock-viewer': {
    id: 'stock-viewer',
    name: 'Stock 閲覧者',
    description: 'Stock Tracker のチャート閲覧のみ可能',
    permissions: ['stocks:read'],
  },
  'stock-user': {
    id: 'stock-user',
    name: 'Stock ユーザー',
    description: 'Stock Tracker のアラート設定・Holding 管理が可能',
    permissions: ['stocks:read', 'stocks:write-own'],
  },
  'stock-admin': {
    id: 'stock-admin',
    name: 'Stock 管理者',
    description: 'Stock Tracker のマスタデータ管理が可能',
    permissions: ['stocks:read', 'stocks:write-own', 'stocks:manage-data'],
  },
  'livetalk-user': {
    id: 'livetalk-user',
    name: 'LiveTalk ユーザー',
    description: 'LiveTalk のチャットを利用できる',
    permissions: ['livetalk:chat'],
  },
  'livetalk-admin': {
    id: 'livetalk-admin',
    name: 'LiveTalk 管理者',
    // livetalk:chat を含めるのは、middleware がチャットの権限を要求するため
    description: 'LiveTalk のチャットと、管理者向けの機能 (ステータスの閲覧など) を利用できる',
    permissions: ['livetalk:chat', 'livetalk:admin'],
  },
  'livetalk-standard': {
    id: 'livetalk-standard',
    name: 'LiveTalk スタンダード',
    description: '課金の権利として付く有料ロール。LiveTalk のスタンダード機能を利用できる',
    permissions: ['livetalk:standard'],
    billing: { service: 'livetalk', rank: 1 },
  },
  'quick-clip-standard': {
    id: 'quick-clip-standard',
    name: 'Quick Clip スタンダード',
    description: '課金の権利として付く有料ロール。Quick Clip のスタンダード機能を利用できる',
    permissions: ['quick-clip:standard'],
    billing: { service: 'quick-clip', rank: 1 },
  },
  'quick-clip-pro': {
    id: 'quick-clip-pro',
    name: 'Quick Clip プロ',
    description:
      '課金の権利として付く有料ロール。Quick Clip のプロ機能を利用できる。上の段のためスタンダードの権限も含む',
    permissions: ['quick-clip:standard', 'quick-clip:pro'],
    billing: { service: 'quick-clip', rank: 2 },
  },
  'quick-clip-unlimited': {
    id: 'quick-clip-unlimited',
    name: 'Quick Clip 使い放題',
    // 売らず課金とも結びつけないため billing を持たない
    description: 'Quick Clip の月の利用回数に上限を設けない。運営者が自分で使うためのロール',
    permissions: ['quick-clip:unlimited'],
  },
  'billing-tester': {
    id: 'billing-tester',
    name: '課金のテスト',
    // 決済は Stripe のサンドボックスで行う。売らず課金とも結びつけないため billing を持たず、
    // 管理者の権限とは分けてある
    description: '本番以外の環境で、テスト用の決済による申し込みを始められる',
    permissions: ['billing:test'],
  },
} as const satisfies Record<string, RoleDefinition>;

/**
 * すべての有効なロールIDの配列
 * APIエンドポイントでのバリデーションに使用
 */
export const VALID_ROLES = Object.keys(ROLES) as string[];

/** 段の比較で使うエラーメッセージ */
export const BILLING_TIER_ERROR_MESSAGES = {
  NOT_BILLING_ROLE: '有料ロールではないため、段を比較できません',
  DIFFERENT_SERVICE: '別のサービスの有料ロールどうしは、段を比較できません',
} as const;

/**
 * 有料サービスの ID と表示名
 * ロール定義の billing.service はここのキーを指す
 */
export const BILLING_SERVICES = {
  livetalk: 'LiveTalk',
  'quick-clip': 'Quick Clip',
} as const satisfies Record<string, string>;

/** 有料サービスの ID */
export type BillingServiceId = keyof typeof BILLING_SERVICES;

type BillingRole = RoleDefinition & { billing: NonNullable<RoleDefinition['billing']> };

const BILLING_ROLES: BillingRole[] = (Object.values(ROLES) as RoleDefinition[])
  .filter((role): role is BillingRole => role.billing !== undefined)
  .sort((a, b) => {
    const byService = a.billing.service.localeCompare(b.billing.service);
    return byService !== 0 ? byService : a.billing.rank - b.billing.rank;
  });

/**
 * 課金の権利として付けられる有料ロールIDの配列 (サービス → rank 昇順)
 * 権利を付けるときの検証と選択肢にだけ使い、読み取りや有効なロールの算出では絞らない
 */
export const PAID_ROLES: string[] = BILLING_ROLES.map((role) => role.id);

/**
 * 有料ロールIDから有料サービスIDを引く
 * 有料ロールでなければ undefined
 */
export function getBillingServiceId(roleId: string): string | undefined {
  return BILLING_ROLES.find((role) => role.id === roleId)?.billing.service;
}

/**
 * 有料サービスの有料ロールIDを、下の段から順に返す
 * 知らないサービスなら空配列
 */
export function getBillingTierRoleIds(serviceId: string): string[] {
  return BILLING_ROLES.filter((role) => role.billing.service === serviceId).map((role) => role.id);
}

/**
 * 同じサービスの有料ロール 2 つの段を比べる。
 *
 * 負なら a が b より下の段、0 なら同じ段、正なら a が b より上の段。
 *
 * @param a - 有料ロールID
 * @param b - 有料ロールID
 * @throws どちらかが有料ロールでない、またはサービスが違うとき
 */
export function compareBillingTier(a: string, b: string): number {
  const roleA = BILLING_ROLES.find((role) => role.id === a);
  const roleB = BILLING_ROLES.find((role) => role.id === b);
  if (!roleA || !roleB) {
    throw new Error(BILLING_TIER_ERROR_MESSAGES.NOT_BILLING_ROLE);
  }
  if (roleA.billing.service !== roleB.billing.service) {
    throw new Error(BILLING_TIER_ERROR_MESSAGES.DIFFERENT_SERVICE);
  }
  return roleA.billing.rank - roleB.billing.rank;
}
