import type {
  User,
  PersonalList,
  Group,
  GroupMembership,
  GroupList,
  TodoItem,
} from '@nagiyu/share-together-core';
import type { DefaultSession } from 'next-auth';

export type { TodoItem };

import type { ApiSuccessResponse, ApiResponse, ErrorResponse as ApiErrorResponse } from '@nagiyu/common';
export type { ApiSuccessResponse, ApiResponse, ApiErrorResponse };

export type HealthResponse = ApiSuccessResponse<{ status: 'ok' }>;
export type UserResponse = ApiSuccessResponse<User>;
export type PersonalListsResponse = ApiSuccessResponse<{ lists: PersonalList[] }>;
export type PersonalListResponse = ApiSuccessResponse<PersonalList>;
export type TodosResponse = ApiSuccessResponse<{ todos: TodoItem[] }>;
export type TodoResponse = ApiSuccessResponse<TodoItem>;
export type GroupsResponse = ApiSuccessResponse<{ groups: Group[] }>;
export type GroupResponse = ApiSuccessResponse<Group>;
export type GroupMembersResponse = ApiSuccessResponse<{ members: GroupMembership[] }>;
export type GroupListsResponse = ApiSuccessResponse<{ lists: GroupList[] }>;
export type GroupListResponse = ApiSuccessResponse<GroupList>;

export type InvitationSummary = {
  groupId: string;
  groupName: string;
  inviterUserId: string;
  inviterName: string;
  createdAt: string;
};

export type InvitationsResponse = ApiSuccessResponse<{ invitations: InvitationSummary[] }>;

export type SessionUser = NonNullable<DefaultSession['user']> & { id: string };

declare module 'next-auth' {
  interface Session {
    user: SessionUser;
  }

  interface User {
    id: string;
  }
}
