import {
  RepositoryError,
  EntityNotFoundError,
  EntityAlreadyExistsError,
  InvalidEntityDataError,
  DatabaseError,
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
});
