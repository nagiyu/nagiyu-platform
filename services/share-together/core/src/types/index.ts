export type GroupRole = 'OWNER' | 'MEMBER';

export type GroupMembershipStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface User {
  userId: string;
  email: string;
  name: string;
  image?: string;
  defaultListId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersonalList {
  listId: string;
  userId: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Group {
  groupId: string;
  name: string;
  ownerUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface GroupMembership {
  groupId: string;
  userId: string;
  role: GroupRole;
  status: GroupMembershipStatus;
  invitedBy?: string;
  invitedAt?: string;
  respondedAt?: string;
  ttl?: number;
  createdAt: string;
  updatedAt: string;
}

export interface GroupList {
  listId: string;
  groupId: string;
  name: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TodoItem {
  todoId: string;
  listId: string;
  title: string;
  isCompleted: boolean;
  createdBy: string;
  completedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export type CreateUserInput = Omit<User, 'createdAt' | 'updatedAt'>;
export type UpdateUserInput = Partial<Pick<User, 'email' | 'name' | 'image' | 'defaultListId'>>;

export type CreatePersonalListInput = Omit<PersonalList, 'createdAt' | 'updatedAt'>;
export type UpdatePersonalListInput = Partial<Pick<PersonalList, 'name'>>;

export type CreateGroupInput = Omit<Group, 'createdAt' | 'updatedAt'>;
export type UpdateGroupInput = Partial<Pick<Group, 'name'>>;

export type CreateGroupMembershipInput = Omit<GroupMembership, 'createdAt' | 'updatedAt'>;
export type UpdateGroupMembershipInput = Partial<
  Pick<GroupMembership, 'role' | 'status' | 'invitedBy' | 'invitedAt' | 'respondedAt' | 'ttl'>
>;

export type CreateGroupListInput = Omit<GroupList, 'createdAt' | 'updatedAt'>;
export type UpdateGroupListInput = Partial<Pick<GroupList, 'name'>>;

export type CreateTodoItemInput = Omit<TodoItem, 'createdAt' | 'updatedAt'>;
export type UpdateTodoItemInput = Partial<Pick<TodoItem, 'title' | 'isCompleted' | 'completedBy'>>;
