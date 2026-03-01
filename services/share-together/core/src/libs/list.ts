import type { ListRepository } from '../repositories/list/list-repository.interface.js';
import type { PersonalList } from '../types/index.js';

const ERROR_MESSAGES = {
  USER_ID_REQUIRED: 'ユーザーIDは必須です',
  LIST_ID_REQUIRED: 'リストIDは必須です',
  LIST_NAME_INVALID: 'リスト名は1〜100文字で入力してください',
  PERSONAL_LIST_NOT_FOUND: '個人リストが見つかりません',
  DEFAULT_LIST_NOT_DELETABLE: 'デフォルトリストは削除できません',
} as const;

const PERSONAL_LIST_NOT_FOUND_MESSAGES = new Set([
  '個人リストが見つかりません',
  '指定された個人リストは存在しません',
]);

export class ListService {
  private readonly listRepository: ListRepository;

  constructor(listRepository: ListRepository) {
    this.listRepository = listRepository;
  }

  public async getPersonalListsByUserId(userId: string): Promise<PersonalList[]> {
    this.assertRequiredValue(userId, ERROR_MESSAGES.USER_ID_REQUIRED);
    return this.listRepository.getPersonalListsByUserId(userId);
  }

  public async getPersonalListById(userId: string, listId: string): Promise<PersonalList> {
    this.assertRequiredValue(userId, ERROR_MESSAGES.USER_ID_REQUIRED);
    this.assertRequiredValue(listId, ERROR_MESSAGES.LIST_ID_REQUIRED);

    const list = await this.listRepository.getPersonalListById(userId, listId);
    if (!list) {
      throw new Error(ERROR_MESSAGES.PERSONAL_LIST_NOT_FOUND);
    }

    return list;
  }

  public async createPersonalList(
    userId: string,
    name: string,
    isDefault = false
  ): Promise<PersonalList> {
    this.assertRequiredValue(userId, ERROR_MESSAGES.USER_ID_REQUIRED);
    const normalizedName = this.normalizeListName(name);

    return this.listRepository.createPersonalList({
      listId: crypto.randomUUID(),
      userId,
      name: normalizedName,
      isDefault,
    });
  }

  public async updatePersonalList(
    userId: string,
    listId: string,
    name: string
  ): Promise<PersonalList> {
    this.assertRequiredValue(userId, ERROR_MESSAGES.USER_ID_REQUIRED);
    this.assertRequiredValue(listId, ERROR_MESSAGES.LIST_ID_REQUIRED);
    const normalizedName = this.normalizeListName(name);

    try {
      return await this.listRepository.updatePersonalList(userId, listId, { name: normalizedName });
    } catch (error) {
      this.rethrowPersonalListNotFoundError(error);
      throw error;
    }
  }

  public async deletePersonalList(userId: string, listId: string): Promise<void> {
    this.assertRequiredValue(userId, ERROR_MESSAGES.USER_ID_REQUIRED);
    this.assertRequiredValue(listId, ERROR_MESSAGES.LIST_ID_REQUIRED);

    const targetList = await this.listRepository.getPersonalListById(userId, listId);
    if (!targetList) {
      throw new Error(ERROR_MESSAGES.PERSONAL_LIST_NOT_FOUND);
    }

    if (targetList.isDefault) {
      throw new Error(ERROR_MESSAGES.DEFAULT_LIST_NOT_DELETABLE);
    }

    try {
      await this.listRepository.deletePersonalList(userId, listId);
    } catch (error) {
      this.rethrowPersonalListNotFoundError(error);
      throw error;
    }
  }

  private assertRequiredValue(value: string, errorMessage: string): void {
    if (value.trim().length === 0) {
      throw new Error(errorMessage);
    }
  }

  private normalizeListName(name: string): string {
    const normalizedName = name.trim();
    if (normalizedName.length < 1 || normalizedName.length > 100) {
      throw new Error(ERROR_MESSAGES.LIST_NAME_INVALID);
    }
    return normalizedName;
  }

  private rethrowPersonalListNotFoundError(error: unknown): void {
    if (error instanceof Error && PERSONAL_LIST_NOT_FOUND_MESSAGES.has(error.message)) {
      throw new Error(ERROR_MESSAGES.PERSONAL_LIST_NOT_FOUND);
    }
  }
}
