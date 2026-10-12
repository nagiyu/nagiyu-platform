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
import { readAttribute, readTimestamp } from '../../../../src/dynamodb/validators.js';
import type {
  DynamoDBAttributes,
  DynamoDBKey,
  EntityMapper,
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
      throw new ConditionalCheckFailedException({ message: 'failed', $metadata: {} });
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
    base: DynamoDBAttributes,
    expression: string,
    names: Record<string, string>,
    values: Record<string, unknown>
  ): DynamoDBAttributes => {
    const result = { ...base };
    const match = expression.match(/^(?:SET (.+?))?(?: ?REMOVE (.+))?$/);
    if (!match) throw new Error(`未対応の更新式: ${expression}`);
    for (const assignment of match[1]?.split(', ') ?? []) {
      const [name, value] = assignment.split(' = ');
      result[names[name]] = values[value];
    }
    for (const name of match[2]?.split(', ') ?? []) {
      delete result[names[name]];
    }
    return result;
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
      checkCondition(command.input, table.get(key));
      table.set(key, stored);
      return {};
    }
    if (command instanceof UpdateCommand) {
      const key = keyString(command.input.Key as DynamoDBKey);
      const existing = table.get(key);
      checkCondition(command.input, existing);
      const updated = applyUpdate(
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
