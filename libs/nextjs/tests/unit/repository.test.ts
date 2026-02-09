/**
 * Repository Helper Unit Tests
 *
 * Note: Full integration tests require actual DynamoDB setup.
 * These tests verify the type signatures and basic structure.
 */

import { describe, it, expect } from '@jest/globals';
import { NextResponse } from 'next/server';
import { withRepository, withRepositories } from '../../src/repository';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

describe('withRepository', () => {
  it('withRepository関数が存在する', () => {
    expect(typeof withRepository).toBe('function');
  });

  it('withRepositoryが関数を返す', () => {
    class MockRepository {
      public client: DynamoDBDocumentClient;
      public tableName: string;

      constructor(client: DynamoDBDocumentClient, tableName: string) {
        this.client = client;
        this.tableName = tableName;
      }
    }

    const mockGetClient = () => ({}) as DynamoDBDocumentClient;
    const mockGetTableName = () => 'test-table';

    const wrapped = withRepository(mockGetClient, mockGetTableName, MockRepository, async () => {
      return NextResponse.json({ success: true });
    });

    expect(typeof wrapped).toBe('function');
  });

  it('リポジトリを初期化してハンドラーを実行する', async () => {
    class MockRepository {
      public client: DynamoDBDocumentClient;
      public tableName: string;

      constructor(client: DynamoDBDocumentClient, tableName: string) {
        this.client = client;
        this.tableName = tableName;
      }

      public async getData() {
        return { data: 'test' };
      }
    }

    const mockClient = {} as DynamoDBDocumentClient;
    const mockGetClient = () => mockClient;
    const mockGetTableName = () => 'test-table';

    const handler = async (repo: MockRepository) => {
      const data = await repo.getData();
      return NextResponse.json(data);
    };

    const wrapped = withRepository(mockGetClient, mockGetTableName, MockRepository, handler);
    const response = await wrapped();

    expect(response.status).toBe(200);
  });

  it('複数の引数をハンドラーに渡す', async () => {
    class MockRepository {
      public client: DynamoDBDocumentClient;
      public tableName: string;

      constructor(client: DynamoDBDocumentClient, tableName: string) {
        this.client = client;
        this.tableName = tableName;
      }
    }

    const mockGetClient = () => ({}) as DynamoDBDocumentClient;
    const mockGetTableName = () => 'test-table';

    const handler = async (repo: MockRepository, arg1: string, arg2: number) => {
      return NextResponse.json({ arg1, arg2 });
    };

    const wrapped = withRepository(mockGetClient, mockGetTableName, MockRepository, handler);
    const response = await wrapped('test', 123);

    expect(response.status).toBe(200);
  });
});

describe('withRepositories', () => {
  it('withRepositories関数が存在する', () => {
    expect(typeof withRepositories).toBe('function');
  });

  it('withRepositoriesが関数を返す', () => {
    class MockRepository1 {
      public client: DynamoDBDocumentClient;
      public tableName: string;

      constructor(client: DynamoDBDocumentClient, tableName: string) {
        this.client = client;
        this.tableName = tableName;
      }
    }

    class MockRepository2 {
      public client: DynamoDBDocumentClient;
      public tableName: string;

      constructor(client: DynamoDBDocumentClient, tableName: string) {
        this.client = client;
        this.tableName = tableName;
      }
    }

    const mockGetClient = () => ({}) as DynamoDBDocumentClient;
    const mockGetTableName = () => 'test-table';

    const wrapped = withRepositories(
      mockGetClient,
      mockGetTableName,
      [MockRepository1, MockRepository2],
      async () => {
        return NextResponse.json({ success: true });
      }
    );

    expect(typeof wrapped).toBe('function');
  });

  it('複数のリポジトリを初期化してハンドラーを実行する', async () => {
    class MockRepository1 {
      public client: DynamoDBDocumentClient;
      public tableName: string;

      constructor(client: DynamoDBDocumentClient, tableName: string) {
        this.client = client;
        this.tableName = tableName;
      }

      public async getData1() {
        return { data: 'test1' };
      }
    }

    class MockRepository2 {
      public client: DynamoDBDocumentClient;
      public tableName: string;

      constructor(client: DynamoDBDocumentClient, tableName: string) {
        this.client = client;
        this.tableName = tableName;
      }

      public async getData2() {
        return { data: 'test2' };
      }
    }

    const mockClient = {} as DynamoDBDocumentClient;
    const mockGetClient = () => mockClient;
    const mockGetTableName = () => 'test-table';

    const handler = async ([repo1, repo2]: [MockRepository1, MockRepository2]) => {
      const data1 = await repo1.getData1();
      const data2 = await repo2.getData2();
      return NextResponse.json({ data1, data2 });
    };

    const wrapped = withRepositories(
      mockGetClient,
      mockGetTableName,
      [MockRepository1, MockRepository2],
      handler
    );
    const response = await wrapped();

    expect(response.status).toBe(200);
  });

  it('複数の引数をハンドラーに渡す', async () => {
    class MockRepository1 {
      public client: DynamoDBDocumentClient;
      public tableName: string;

      constructor(client: DynamoDBDocumentClient, tableName: string) {
        this.client = client;
        this.tableName = tableName;
      }
    }

    class MockRepository2 {
      public client: DynamoDBDocumentClient;
      public tableName: string;

      constructor(client: DynamoDBDocumentClient, tableName: string) {
        this.client = client;
        this.tableName = tableName;
      }
    }

    const mockGetClient = () => ({}) as DynamoDBDocumentClient;
    const mockGetTableName = () => 'test-table';

    const handler = async (
      repos: [MockRepository1, MockRepository2],
      arg1: string,
      arg2: number
    ) => {
      return NextResponse.json({ arg1, arg2 });
    };

    const wrapped = withRepositories(
      mockGetClient,
      mockGetTableName,
      [MockRepository1, MockRepository2],
      handler
    );
    const response = await wrapped('test', 456);

    expect(response.status).toBe(200);
  });
});
