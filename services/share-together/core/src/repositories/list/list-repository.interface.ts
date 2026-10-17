import type {
  PersonalList,
  GroupList,
  CreatePersonalListInput,
  UpdatePersonalListInput,
  CreateGroupListInput,
  UpdateGroupListInput,
} from '../../types/index.js';

export interface ListRepository {
  /** 作成順ではなく、リスト ID の昇順で返す (DynamoDB のソートキー順) */
  getPersonalListsByUserId(userId: string): Promise<PersonalList[]>;
  getPersonalListById(userId: string, listId: string): Promise<PersonalList | null>;
  /** @throws EntityAlreadyExistsError 同じリスト ID が既に存在するとき */
  createPersonalList(input: CreatePersonalListInput): Promise<PersonalList>;
  /** @throws EntityNotFoundError 個人リストが存在しないとき */
  updatePersonalList(
    userId: string,
    listId: string,
    updates: UpdatePersonalListInput
  ): Promise<PersonalList>;
  /**
   * 個人リストを削除する。対象がなくても成功する。
   * デフォルトリストかどうかの検査はしない (業務ルールとして呼び出し側が行う)。
   */
  deletePersonalList(userId: string, listId: string): Promise<void>;

  /** 作成順ではなく、リスト ID の昇順で返す (DynamoDB のソートキー順) */
  getGroupListsByGroupId(groupId: string): Promise<GroupList[]>;
  getGroupListById(groupId: string, listId: string): Promise<GroupList | null>;
  /** @throws EntityAlreadyExistsError 同じリスト ID が既に存在するとき */
  createGroupList(input: CreateGroupListInput): Promise<GroupList>;
  /** @throws EntityNotFoundError グループリストが存在しないとき */
  updateGroupList(
    groupId: string,
    listId: string,
    updates: UpdateGroupListInput
  ): Promise<GroupList>;
  /** グループリストを削除する。対象がなくても成功する */
  deleteGroupList(groupId: string, listId: string): Promise<void>;
}
