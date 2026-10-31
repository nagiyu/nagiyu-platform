import { InvalidInputError } from '../../../src/validation/invalid-input-error.js';

describe('InvalidInputError', () => {
  it('渡したメッセージと名前を持ち、Error として判定できる', () => {
    const error = new InvalidInputError('リストIDは必須です');

    expect(error).toBeInstanceOf(InvalidInputError);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('リストIDは必須です');
    expect(error.name).toBe('InvalidInputError');
  });
});
