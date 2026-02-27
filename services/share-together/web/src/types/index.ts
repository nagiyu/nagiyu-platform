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

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiSuccessResponse<T> {
  data: T;
}

export interface ApiErrorResponse {
  error: ApiError;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

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
export type InvitationsResponse = ApiSuccessResponse<{ invitations: GroupMembership[] }>;

export type SessionUser = NonNullable<DefaultSession['user']> & { id: string };

declare module 'next-auth' {
  interface Session {
    user: SessionUser;
  }

  interface User {
    id: string;
  }
}
