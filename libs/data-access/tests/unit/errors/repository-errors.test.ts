import {
  RepositoryError,
  EntityNotFoundError,
  EntityAlreadyExistsError,
  InvalidEntityDataError,
  DatabaseError,
} from '../../../src/errors/repository-errors';

describe('RepositoryError', () => {
  it('基底エラークラスとして機能する', () => {
    const error = new RepositoryError('テストエラー');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(RepositoryError);
    expect(error.name).toBe('RepositoryError');
    expect(error.message).toBe('テストエラー');
  });
});

describe('EntityNotFoundError', () => {
  it('エンティティが見つからない場合のエラーメッセージを生成する', () => {
    const error = new EntityNotFoundError('User', 'user123');

    expect(error).toBeInstanceOf(RepositoryError);
    expect(error.name).toBe('EntityNotFoundError');
    expect(error.message).toBe('エンティティが見つかりません: User=user123');
  });
});

describe('EntityAlreadyExistsError', () => {
  it('エンティティが既に存在する場合のエラーメッセージを生成する', () => {
    const error = new EntityAlreadyExistsError('User', 'user123');

    expect(error).toBeInstanceOf(RepositoryError);
    expect(error.name).toBe('EntityAlreadyExistsError');
    expect(error.message).toBe('エンティティは既に存在します: User=user123');
  });
});

describe('InvalidEntityDataError', () => {
  it('無効なエンティティデータのエラーメッセージを生成する', () => {
    const error = new InvalidEntityDataError('必須フィールドが不足しています');

    expect(error).toBeInstanceOf(RepositoryError);
    expect(error.name).toBe('InvalidEntityDataError');
    expect(error.message).toBe('エンティティデータが無効です: 必須フィールドが不足しています');
  });
});

describe('DatabaseError', () => {
  it('データベースエラーのエラーメッセージを生成する', () => {
    const error = new DatabaseError('接続エラー');

    expect(error).toBeInstanceOf(RepositoryError);
    expect(error.name).toBe('DatabaseError');
    expect(error.message).toBe('データベースエラーが発生しました: 接続エラー');
    expect(error.cause).toBeUndefined();
  });

  it('原因エラーを含めることができる', () => {
    const cause = new Error('原因エラー');
    const error = new DatabaseError('接続エラー', cause);

    expect(error.cause).toBe(cause);
  });
});
