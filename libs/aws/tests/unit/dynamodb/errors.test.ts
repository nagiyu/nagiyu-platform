import {
  RepositoryError,
  EntityNotFoundError,
  EntityAlreadyExistsError,
  InvalidEntityDataError,
  DatabaseError,
  mapConditionalCheckFailed,
  isConditionalCheckFailed,
  toDatabaseError,
} from '../../../src/dynamodb/errors.js';

describe('errors', () => {
  describe('RepositoryError', () => {
    it('should create error with message', () => {
      const error = new RepositoryError('Test error');

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('RepositoryError');
      expect(error.message).toBe('Test error');
    });
  });

  describe('EntityNotFoundError', () => {
    it('should create error with entity type and identifier', () => {
      const error = new EntityNotFoundError('User', 'user-123');

      expect(error).toBeInstanceOf(RepositoryError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('EntityNotFoundError');
      expect(error.message).toBe('エンティティが見つかりません: User=user-123');
    });

    it('should handle different entity types', () => {
      const error = new EntityNotFoundError('Product', 'prod-456');

      expect(error.message).toBe('エンティティが見つかりません: Product=prod-456');
    });
  });

  describe('EntityAlreadyExistsError', () => {
    it('should create error with entity type and identifier', () => {
      const error = new EntityAlreadyExistsError('User', 'user-123');

      expect(error).toBeInstanceOf(RepositoryError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('EntityAlreadyExistsError');
      expect(error.message).toBe('エンティティは既に存在します: User=user-123');
    });

    it('should handle different entity types', () => {
      const error = new EntityAlreadyExistsError('Order', 'order-789');

      expect(error.message).toBe('エンティティは既に存在します: Order=order-789');
    });
  });

  describe('InvalidEntityDataError', () => {
    it('should create error with custom message', () => {
      const error = new InvalidEntityDataError('Invalid email format');

      expect(error).toBeInstanceOf(RepositoryError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('InvalidEntityDataError');
      expect(error.message).toBe('エンティティデータが無効です: Invalid email format');
    });

    it('should handle different validation messages', () => {
      const error = new InvalidEntityDataError('Age must be positive');

      expect(error.message).toBe('エンティティデータが無効です: Age must be positive');
    });
  });

  describe('DatabaseError', () => {
    it('should create error with message', () => {
      const error = new DatabaseError('Connection failed');

      expect(error).toBeInstanceOf(RepositoryError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('DatabaseError');
      expect(error.message).toBe('データベースエラーが発生しました: Connection failed');
      expect(error.cause).toBeUndefined();
    });

    it('should create error with cause', () => {
      const originalError = new Error('Network timeout');
      const error = new DatabaseError('Failed to query', originalError);

      expect(error.message).toBe('データベースエラーが発生しました: Failed to query');
      expect(error.cause).toBe(originalError);
      expect(error.cause?.message).toBe('Network timeout');
    });

    it('should preserve cause error', () => {
      const cause = new TypeError('Invalid type');
      const error = new DatabaseError('Type mismatch', cause);

      expect(error.cause).toBeInstanceOf(TypeError);
      expect(error.cause?.message).toBe('Invalid type');
    });
  });

  describe('Error inheritance', () => {
    it('should maintain proper inheritance chain', () => {
      const repositoryError = new RepositoryError('Base error');
      const entityNotFoundError = new EntityNotFoundError('User', '123');
      const entityExistsError = new EntityAlreadyExistsError('User', '123');
      const invalidDataError = new InvalidEntityDataError('Invalid');
      const databaseError = new DatabaseError('DB error');

      expect(repositoryError).toBeInstanceOf(Error);
      expect(entityNotFoundError).toBeInstanceOf(RepositoryError);
      expect(entityExistsError).toBeInstanceOf(RepositoryError);
      expect(invalidDataError).toBeInstanceOf(RepositoryError);
      expect(databaseError).toBeInstanceOf(RepositoryError);
    });
  });

  describe('mapConditionalCheckFailed', () => {
    it('ConditionalCheckFailedException のとき onExists を呼ぶ', () => {
      const error = Object.assign(new Error('condition failed'), {
        name: 'ConditionalCheckFailedException',
      });

      expect(() =>
        mapConditionalCheckFailed(error, {
          onExists: () => {
            throw new EntityAlreadyExistsError('Item', 'id-1');
          },
        })
      ).toThrow(EntityAlreadyExistsError);
    });

    it('ConditionalCheckFailedException のとき onMissing を呼ぶ', () => {
      const error = Object.assign(new Error('condition failed'), {
        name: 'ConditionalCheckFailedException',
      });

      expect(() =>
        mapConditionalCheckFailed(error, {
          onMissing: () => {
            throw new EntityNotFoundError('Item', 'id-1');
          },
        })
      ).toThrow(EntityNotFoundError);
    });

    it('onExists と onMissing の両方がある場合は onExists を優先する', () => {
      const error = Object.assign(new Error('condition failed'), {
        name: 'ConditionalCheckFailedException',
      });

      expect(() =>
        mapConditionalCheckFailed(error, {
          onExists: () => {
            throw new EntityAlreadyExistsError('Item', 'id-1');
          },
          onMissing: () => {
            throw new EntityNotFoundError('Item', 'id-1');
          },
        })
      ).toThrow(EntityAlreadyExistsError);
    });

    it('ConditionalCheckFailedException 以外のエラーは無視する', () => {
      const error = new Error('network error');

      expect(() =>
        mapConditionalCheckFailed(error, {
          onExists: () => {
            throw new EntityAlreadyExistsError('Item', 'id-1');
          },
        })
      ).not.toThrow();
    });

    it('Error でない値は無視する', () => {
      expect(() =>
        mapConditionalCheckFailed('some string', {
          onExists: () => {
            throw new EntityAlreadyExistsError('Item', 'id-1');
          },
        })
      ).not.toThrow();
    });

    it('コールバックなしでも例外を投げない', () => {
      const error = Object.assign(new Error('condition failed'), {
        name: 'ConditionalCheckFailedException',
      });

      expect(() => mapConditionalCheckFailed(error, {})).not.toThrow();
    });
  });

  describe('isConditionalCheckFailed', () => {
    it('name が一致する Error は true', () => {
      const error = new Error('x');
      error.name = 'ConditionalCheckFailedException';
      expect(isConditionalCheckFailed(error)).toBe(true);
    });

    it('name が一致するプレーンオブジェクトは true', () => {
      expect(isConditionalCheckFailed({ name: 'ConditionalCheckFailedException' })).toBe(true);
    });

    it('別の name は false', () => {
      expect(isConditionalCheckFailed(new Error('x'))).toBe(false);
      expect(isConditionalCheckFailed({ name: 'Other' })).toBe(false);
    });

    it('null / undefined / 文字列は false', () => {
      expect(isConditionalCheckFailed(null)).toBe(false);
      expect(isConditionalCheckFailed(undefined)).toBe(false);
      expect(isConditionalCheckFailed('ConditionalCheckFailedException')).toBe(false);
    });
  });

  describe('toDatabaseError', () => {
    it('Error を DatabaseError に包み cause に元エラーを渡す', () => {
      const cause = new Error('boom');
      const result = toDatabaseError(cause);
      expect(result).toBeInstanceOf(DatabaseError);
      expect(result.message).toBe('データベースエラーが発生しました: boom');
      expect((result as DatabaseError).cause).toBe(cause);
    });

    it('文字列は DatabaseError になり cause は undefined', () => {
      const result = toDatabaseError('oops');
      expect(result).toBeInstanceOf(DatabaseError);
      expect(result.message).toBe('データベースエラーが発生しました: oops');
      expect((result as DatabaseError).cause).toBeUndefined();
    });

    it('DatabaseError はそのまま返す', () => {
      const original = new DatabaseError('inner');
      const result = toDatabaseError(original);
      expect(result).toBe(original);
      expect(result.message).toBe('データベースエラーが発生しました: inner');
    });

    it('RepositoryError 派生はそのまま返す', () => {
      const notFound = new EntityNotFoundError('User', 'u1');
      expect(toDatabaseError(notFound)).toBe(notFound);
      const base = new RepositoryError('base');
      expect(toDatabaseError(base)).toBe(base);
    });
  });
});
