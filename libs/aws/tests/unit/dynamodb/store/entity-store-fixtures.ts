/**
 * EntityStore のテスト用フィクスチャ。
 * 実 DynamoDB の条件式・更新式を最小限エミュレートする docClient を持ち、
 * DynamoDB 版と InMemory 版を同じシナリオで検証できるようにする。
 */

import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { InvalidEntityDataError } from '../../../../src/dynamodb/errors.js';
import { REMOVE_ATTRIBUTE } from '../../../../src/dynamodb/helpers.js';
import { readAttribute, readTimestamp } from '../../../../src/dynamodb/validators.js';
import type {
  DynamoDBAttributes,
  DynamoDBKey,
  EntityMapper,
  EntityPatch,
} from '../../../../src/dynamodb/mapper/entity-mapper.interface.js';

export interface Note {
  id: string;
  title: string;
  memo?: string;
  createdAt: number;
  updatedAt: number;
}

/** PK/SK テーブル。旧形式 (小文字属性名・ISO 文字列・エポック秒) を読める */
export const noteMapper: EntityMapper<Note, { id: string }> = {
  entityType: 'Note',
  legacyAttributeNames: {
    Title: ['title'],
    Memo: ['memo'],
    CreatedAt: ['createdAt'],
    UpdatedAt: ['updatedAt'],
  },
  buildKeys: (key) => ({ PK: `NOTE#${key.id}`, SK: 'META' }),
  getKey: (entity) => ({ id: entity.id }),
  toItem: (entity) => ({
    PK: `NOTE#${entity.id}`,
    SK: 'META',
    Type: 'Note',
    Id: entity.id,
    Title: entity.title,
    Memo: entity.memo,
    CreatedAt: entity.createdAt,
    UpdatedAt: entity.updatedAt,
  }),
  toUpdateAttributes: (changes) => ({
    Title: changes.title === null ? REMOVE_ATTRIBUTE : changes.title,
    Memo: changes.memo === null ? REMOVE_ATTRIBUTE : changes.memo,
    CreatedAt: changes.createdAt === null ? REMOVE_ATTRIBUTE : changes.createdAt,
    // store が管理する属性。指定しても無視されることの確認用
    UpdatedAt: changes.updatedAt ?? undefined,
  }),
  toEntity: (item) => {
    const title = readAttribute(item, 'Title', ['title']);
    if (typeof title !== 'string') {
      throw new InvalidEntityDataError('Title が文字列ではありません');
    }
    const memo = readAttribute(item, 'Memo', ['memo']);
    return {
      id: String(item.Id),
      title,
      memo: typeof memo === 'string' ? memo : undefined,
      createdAt: readTimestamp(item, 'CreatedAt', ['createdAt']),
      updatedAt: readTimestamp(item, 'UpdatedAt', ['updatedAt']),
    };
  },
};

export type NotePatch = EntityPatch<Note>;

export interface Profile {
  userId: string;
  name: string;
  updatedAt: number;
}

/** 単一キー (パーティションキーのみ) のテーブル */
export const profileMapper: EntityMapper<Profile, { userId: string }> = {
  entityType: 'Profile',
  buildKeys: (key) => ({ userId: key.userId }),
  getKey: (entity) => ({ userId: entity.userId }),
  toItem: (entity) => ({
    userId: entity.userId,
    Type: 'Profile',
    Name: entity.name,
    UpdatedAt: entity.updatedAt,
  }),
  toUpdateAttributes: (changes) => ({ Name: changes.name ?? undefined }),
  toEntity: (item) => ({
    userId: String(item.userId),
    name: String(item.Name),
    updatedAt: readTimestamp(item, 'UpdatedAt'),
  }),
};

export function keyString(keys: DynamoDBKey): string {
  return Object.values(keys).join('#');
}

/** Get / Put / Update / Delete の条件式と SET / REMOVE を解釈する最小の docClient */
export function createFakeDocClient(): {
  docClient: DynamoDBDocumentClient;
  table: Map<string, DynamoDBAttributes>;
  send: jest.Mock;
} {
  const table = new Map<string, DynamoDBAttributes>();

  const checkCondition = (
    input: {
      ReturnValuesOnConditionCheckFailure?: string;
      ConditionExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
      ExpressionAttributeValues?: Record<string, unknown>;
    },
    existing: DynamoDBAttributes | undefined
  ): void => {
    const expression = input.ConditionExpression;
    if (!expression) {
      return;
    }
    const names = input.ExpressionAttributeNames ?? {};
    const values = input.ExpressionAttributeValues ?? {};
    const failed = (): never => {
      // ALL_OLD を要求したときだけ、実 DynamoDB と同じく旧 Item (生の AttributeValue 形式) が付く
      const Item =
        existing && input.ReturnValuesOnConditionCheckFailure === 'ALL_OLD'
          ? Object.fromEntries(Object.entries(existing).map(([k, v]) => [k, { S: String(v) }]))
          : undefined;
      throw new ConditionalCheckFailedException({ message: 'failed', $metadata: {}, Item });
    };
    for (const clause of expression.split(' AND ')) {
      const notExists = clause.match(/^attribute_not_exists\((#\w+)\)$/);
      const exists = clause.match(/^attribute_exists\((#\w+)\)$/);
      const equals = clause.match(/^(#\w+) = (:\w+)$/);
      if (notExists) {
        if (existing && existing[names[notExists[1]]] !== undefined) failed();
      } else if (exists) {
        if (!existing || existing[names[exists[1]]] === undefined) failed();
      } else if (equals) {
        if (!existing || existing[names[equals[1]]] !== values[equals[2]]) failed();
      } else {
        throw new Error(`未対応の条件式: ${clause}`);
      }
    }
  };

  const applyUpdate = (
    keyAttributes: string[],
    base: DynamoDBAttributes,
    expression: string,
    names: Record<string, string>,
    values: Record<string, unknown>
  ): DynamoDBAttributes => {
    const result = { ...base };
    const match = expression.match(/^(?:SET (.+?))?(?: ?REMOVE (.+))?$/);
    if (!match) throw new Error(`未対応の更新式: ${expression}`);
    const touched = new Set<string>();
    const touch = (attribute: string): void => {
      if (keyAttributes.includes(attribute))
        throw new Error(`キー属性は更新できない: ${attribute}`);
      // 同じパスを SET と REMOVE の両方、または複数回で指定すると DynamoDB は拒否する
      if (touched.has(attribute)) throw new Error(`更新パスが重複: ${attribute}`);
      touched.add(attribute);
    };
    for (const assignment of match[1]?.split(', ') ?? []) {
      const [name, value] = assignment.split(' = ');
      touch(names[name]);
      result[names[name]] = values[value];
    }
    for (const name of match[2]?.split(', ') ?? []) {
      touch(names[name]);
      delete result[names[name]];
    }
    return result;
  };

  /** DynamoDB が拒否する式の不備 (未使用/未定義のプレースホルダ、空の値マップ) を検出する */
  const validateExpressions = (input: {
    UpdateExpression?: string;
    ConditionExpression?: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, unknown>;
  }): void => {
    const text = `${input.UpdateExpression ?? ''} ${input.ConditionExpression ?? ''}`;
    const usedNames = new Set(text.match(/#\w+/g) ?? []);
    const usedValues = new Set(text.match(/:\w+/g) ?? []);
    const names = input.ExpressionAttributeNames;
    const values = input.ExpressionAttributeValues;
    if (names && Object.keys(names).length === 0) throw new Error('空の ExpressionAttributeNames');
    if (values && Object.keys(values).length === 0)
      throw new Error('空の ExpressionAttributeValues');
    for (const used of usedNames) {
      if (!names || !(used in names)) throw new Error(`未定義の名前プレースホルダ: ${used}`);
    }
    for (const declared of Object.keys(names ?? {})) {
      if (!usedNames.has(declared)) throw new Error(`未使用の名前プレースホルダ: ${declared}`);
    }
    for (const used of usedValues) {
      if (!values || !(used in values)) throw new Error(`未定義の値プレースホルダ: ${used}`);
    }
    for (const declared of Object.keys(values ?? {})) {
      if (!usedValues.has(declared)) throw new Error(`未使用の値プレースホルダ: ${declared}`);
    }
  };

  const send = jest.fn(async (command: unknown) => {
    if (command instanceof GetCommand) {
      const item = table.get(keyString(command.input.Key as DynamoDBKey));
      return { Item: item ? { ...item } : undefined };
    }
    if (command instanceof PutCommand) {
      const item = command.input.Item as DynamoDBAttributes;
      // 実クライアントは undefined の属性を落とす
      const stored = Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined));
      const key = noteOrProfileKey(stored);
      validateExpressions(command.input);
      checkCondition(command.input, table.get(key));
      table.set(key, stored);
      return {};
    }
    if (command instanceof UpdateCommand) {
      const key = keyString(command.input.Key as DynamoDBKey);
      const existing = table.get(key);
      validateExpressions(command.input);
      checkCondition(command.input, existing);
      const updated = applyUpdate(
        Object.keys(command.input.Key as DynamoDBKey),
        existing ?? { ...(command.input.Key as DynamoDBKey) },
        command.input.UpdateExpression as string,
        command.input.ExpressionAttributeNames ?? {},
        command.input.ExpressionAttributeValues ?? {}
      );
      table.set(key, updated);
      return { Attributes: { ...updated } };
    }
    if (command instanceof DeleteCommand) {
      const key = keyString(command.input.Key as DynamoDBKey);
      validateExpressions(command.input);
      checkCondition(command.input, table.get(key));
      table.delete(key);
      return {};
    }
    throw new Error('未対応のコマンド');
  });

  return { docClient: { send } as unknown as DynamoDBDocumentClient, table, send };
}

function noteOrProfileKey(item: DynamoDBAttributes): string {
  return item.PK !== undefined ? `${item.PK}#${item.SK}` : String(item.userId);
}
