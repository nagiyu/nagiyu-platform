export type GroupRole = 'OWNER' | 'MEMBER';

export type GroupMembershipStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface User {
  userId: string;
  email: string;
  name: string;
  image?: string;
  defaultListId: string;
  /** 作成日時 (エポックミリ秒) */
  createdAt: number;
  /** 更新日時 (エポックミリ秒) */
  updatedAt: number;
}

export interface PersonalList {
  listId: string;
  userId: string;
  name: string;
  isDefault: boolean;
  /** 作成日時 (エポックミリ秒) */
  createdAt: number;
  /** 更新日時 (エポックミリ秒) */
  updatedAt: number;
}

export interface Group {
  groupId: string;
  name: string;
  ownerUserId: string;
  /** 作成日時 (エポックミリ秒) */
  createdAt: number;
  /** 更新日時 (エポックミリ秒) */
  updatedAt: number;
}

export interface GroupMembership {
  groupId: string;
  userId: string;
  role: GroupRole;
  status: GroupMembershipStatus;
  invitedBy?: string;
  /** 招待日時 (エポックミリ秒) */
  invitedAt?: number;
  /** 招待への応答日時 (エポックミリ秒) */
  respondedAt?: number;
  /** 招待の有効期限 (エポックミリ秒)。保存時は TTL 属性のエポック秒に換算される */
  expiresAt?: number;
  /** 作成日時 (エポックミリ秒) */
  createdAt: number;
  /** 更新日時 (エポックミリ秒) */
  updatedAt: number;
}

export interface GroupList {
  listId: string;
  groupId: string;
  name: string;
  createdBy: string;
  /** 作成日時 (エポックミリ秒) */
  createdAt: number;
  /** 更新日時 (エポックミリ秒) */
  updatedAt: number;
}

export interface TodoItem {
  todoId: string;
  listId: string;
  title: string;
  isCompleted: boolean;
  createdBy: string;
  completedBy?: string;
  /** 作成日時 (エポックミリ秒) */
  createdAt: number;
  /** 更新日時 (エポックミリ秒) */
  updatedAt: number;
}

export type CreateUserInput = Omit<User, 'createdAt' | 'updatedAt'>;
export type UpdateUserInput = Partial<Pick<User, 'email' | 'name' | 'image' | 'defaultListId'>>;

export type CreatePersonalListInput = Omit<PersonalList, 'createdAt' | 'updatedAt'>;
export type UpdatePersonalListInput = Partial<Pick<PersonalList, 'name'>>;

export type CreateGroupInput = Omit<Group, 'createdAt' | 'updatedAt'>;
export type UpdateGroupInput = Partial<Pick<Group, 'name'>>;

export type CreateGroupMembershipInput = Omit<GroupMembership, 'createdAt' | 'updatedAt'>;
/** 任意項目 (invitedBy・invitedAt・respondedAt・expiresAt) は null を渡すと属性を削除する (undefined は変更なし) */
export type UpdateGroupMembershipInput = Partial<Pick<GroupMembership, 'role' | 'status'>> & {
  invitedBy?: string | null;
  invitedAt?: number | null;
  respondedAt?: number | null;
  expiresAt?: number | null;
};

export type CreateGroupListInput = Omit<GroupList, 'createdAt' | 'updatedAt'>;
export type UpdateGroupListInput = Partial<Pick<GroupList, 'name'>>;

export type CreateTodoItemInput = Omit<TodoItem, 'createdAt' | 'updatedAt'>;
/** completedBy に null を渡すと完了者の属性を削除する (undefined は変更なし) */
export type UpdateTodoItemInput = Partial<Pick<TodoItem, 'title' | 'isCompleted'>> & {
  completedBy?: string | null;
};
