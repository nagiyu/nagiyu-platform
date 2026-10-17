import {
  immutablePatchValue,
  optionalPatchValue,
  readAttribute,
  readTimestamp,
  requiredPatchValue,
  validateBooleanField,
  validateStringField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
} from '@nagiyu/aws';
import type { TodoItem } from '../../types/index.js';

/** ToDo の識別に使うビジネスキー */
export interface TodoItemKey {
  listId: string;
  todoId: string;
}

/** ToDo アイテムの SK の接頭辞。一覧の Query で使う */
export const TODO_SK_PREFIX = 'TODO#';

/**
 * リスト ID から ToDo アイテムの PK を構築する
 *
 * @param listId - リスト ID
 */
export function buildTodoPk(listId: string): string {
  return `LIST#${listId}`;
}

/**
 * TodoItem Mapper
 *
 * TodoItem と DynamoDB Item の相互変換を担当する。
 * 保存は PascalCase の属性名と数値ミリ秒の時刻で行い、読み取りは旧形式
 * (camelCase の属性名と ISO 文字列の時刻) も受け付ける。
 */
export class TodoItemMapper implements EntityMapper<TodoItem, TodoItemKey> {
  public readonly entityType = 'TodoItem';

  // 旧形式のデータは書き込まれるまで残るため、更新時に旧名を消して二重に残さない
  public readonly legacyAttributeNames = {
    TodoID: ['todoId'],
    ListID: ['listId'],
    Title: ['title'],
    IsCompleted: ['isCompleted'],
    CreatedBy: ['createdBy'],
    CompletedBy: ['completedBy'],
    CreatedAt: ['createdAt'],
    UpdatedAt: ['updatedAt'],
  } as const;

  public buildKeys(key: TodoItemKey): DynamoDBKey {
    return {
      PK: buildTodoPk(key.listId),
      SK: `${TODO_SK_PREFIX}${key.todoId}`,
    };
  }

  public getKey(entity: TodoItem): TodoItemKey {
    return { listId: entity.listId, todoId: entity.todoId };
  }

  public toItem(entity: TodoItem): DynamoDBAttributes {
    return {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      TodoID: entity.todoId,
      ListID: entity.listId,
      Title: entity.title,
      IsCompleted: entity.isCompleted,
      CreatedBy: entity.createdBy,
      // DocumentClient の設定によっては undefined を含む Item が拒否されるため、未完了のときは属性ごと省く
      ...(entity.completedBy !== undefined ? { CompletedBy: entity.completedBy } : {}),
      CreatedAt: entity.createdAt,
      UpdatedAt: entity.updatedAt,
    };
  }

  /**
   * Entity の部分を保存用の属性に変換する
   *
   * todoId / listId はキーに、createdBy / createdAt は作成時の値として固定される。
   * completedBy に null を渡すと完了者の属性を削除する。
   *
   * @throws InvalidEntityDataError 必須項目が null のとき、または変更不可の項目を含むとき
   */
  public toUpdateAttributes(changes: EntityPatch<TodoItem>): DynamoDBAttributes {
    return {
      TodoID: immutablePatchValue(changes.todoId, 'TodoID'),
      ListID: immutablePatchValue(changes.listId, 'ListID'),
      CreatedBy: immutablePatchValue(changes.createdBy, 'CreatedBy'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      Title: requiredPatchValue(changes.title, 'Title'),
      IsCompleted: requiredPatchValue(changes.isCompleted, 'IsCompleted'),
      CompletedBy: optionalPatchValue(changes.completedBy),
    };
  }

  public toEntity(item: DynamoDBAttributes): TodoItem {
    const legacy = this.legacyAttributeNames;
    const completedBy = readAttribute(item, 'CompletedBy', legacy.CompletedBy);

    return {
      todoId: validateStringField(readAttribute(item, 'TodoID', legacy.TodoID), 'TodoID'),
      listId: validateStringField(readAttribute(item, 'ListID', legacy.ListID), 'ListID'),
      // 旧実装は型だけを検査していたため、空のタイトルも読めるようにする
      title: validateStringField(readAttribute(item, 'Title', legacy.Title), 'Title', {
        allowEmpty: true,
      }),
      isCompleted: validateBooleanField(
        readAttribute(item, 'IsCompleted', legacy.IsCompleted),
        'IsCompleted'
      ),
      createdBy: validateStringField(
        readAttribute(item, 'CreatedBy', legacy.CreatedBy),
        'CreatedBy'
      ),
      // 未完了の ToDo は属性を持たないため、キーごと省いて JSON に null を出さない
      ...(completedBy === undefined
        ? {}
        : { completedBy: validateStringField(completedBy, 'CompletedBy') }),
      createdAt: readTimestamp(item, 'CreatedAt', legacy.CreatedAt),
      updatedAt: readTimestamp(item, 'UpdatedAt', legacy.UpdatedAt),
    };
  }
}
