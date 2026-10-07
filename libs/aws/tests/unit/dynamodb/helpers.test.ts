import {
  REMOVE_ATTRIBUTE,
  buildUpdateExpression,
  conditionalPut,
  conditionalUpdate,
  conditionalDelete,
} from '../../../src/dynamodb/helpers.js';

describe('helpers', () => {
  describe('buildUpdateExpression', () => {
    const ts = { attributeName: 'UpdatedAt', value: 1234567890 };

    it('SET のみ', () => {
      expect(buildUpdateExpression({ Name: 'a', Age: 3 })).toEqual({
        UpdateExpression: 'SET #n0 = :v0, #n1 = :v1',
        ExpressionAttributeNames: { '#n0': 'Name', '#n1': 'Age' },
        ExpressionAttributeValues: { ':v0': 'a', ':v1': 3 },
      });
    });

    it('REMOVE のみは ExpressionAttributeValues キーを持たない', () => {
      const result = buildUpdateExpression({ Memo: REMOVE_ATTRIBUTE, Tag: REMOVE_ATTRIBUTE });

      expect(result).toEqual({
        UpdateExpression: 'REMOVE #n0, #n1',
        ExpressionAttributeNames: { '#n0': 'Memo', '#n1': 'Tag' },
      });
      expect(result).not.toHaveProperty('ExpressionAttributeValues');
    });

    it('SET と REMOVE を併用すると連番を共有し単一スペースで連結する', () => {
      expect(buildUpdateExpression({ A: 1, B: REMOVE_ATTRIBUTE, C: 2 })).toEqual({
        UpdateExpression: 'SET #n0 = :v0, #n2 = :v2 REMOVE #n1',
        ExpressionAttributeNames: { '#n0': 'A', '#n1': 'B', '#n2': 'C' },
        ExpressionAttributeValues: { ':v0': 1, ':v2': 2 },
      });
    });

    it('undefined はスキップし連番も消費しない', () => {
      expect(buildUpdateExpression({ A: undefined, B: 'b', C: undefined, D: 'd' })).toEqual({
        UpdateExpression: 'SET #n0 = :v0, #n1 = :v1',
        ExpressionAttributeNames: { '#n0': 'B', '#n1': 'D' },
        ExpressionAttributeValues: { ':v0': 'b', ':v1': 'd' },
      });
    });

    it('null / 空文字 / 0 / false は SET 対象', () => {
      const result = buildUpdateExpression({ A: null, B: '', C: 0, D: false });

      expect(result?.UpdateExpression).toBe('SET #n0 = :v0, #n1 = :v1, #n2 = :v2, #n3 = :v3');
      expect(result?.ExpressionAttributeValues).toEqual({
        ':v0': null,
        ':v1': '',
        ':v2': 0,
        ':v3': false,
      });
    });

    it('timestamp はフィールドの次の連番で SET 句の末尾に付く', () => {
      expect(buildUpdateExpression({ A: 1, B: REMOVE_ATTRIBUTE }, { timestamp: ts })).toEqual({
        UpdateExpression: 'SET #n0 = :v0, #n2 = :v2 REMOVE #n1',
        ExpressionAttributeNames: { '#n0': 'A', '#n1': 'B', '#n2': 'UpdatedAt' },
        ExpressionAttributeValues: { ':v0': 1, ':v2': 1234567890 },
      });
    });

    it('REMOVE のみでも timestamp があれば SET 句が付く', () => {
      expect(buildUpdateExpression({ A: REMOVE_ATTRIBUTE }, { timestamp: ts })).toEqual({
        UpdateExpression: 'SET #n1 = :v1 REMOVE #n0',
        ExpressionAttributeNames: { '#n0': 'A', '#n1': 'UpdatedAt' },
        ExpressionAttributeValues: { ':v1': 1234567890 },
      });
    });

    it('更新項目が空なら null', () => {
      expect(buildUpdateExpression({})).toBeNull();
    });

    it('すべて undefined なら null', () => {
      expect(buildUpdateExpression({ A: undefined })).toBeNull();
    });

    it('更新項目が空の場合 timestamp があっても null (更新項目に数えない)', () => {
      expect(buildUpdateExpression({}, { timestamp: ts })).toBeNull();
    });

    it('updateTimestampWhenEmpty が true なら timestamp のみを更新する', () => {
      expect(
        buildUpdateExpression({ A: undefined }, { timestamp: ts, updateTimestampWhenEmpty: true })
      ).toEqual({
        UpdateExpression: 'SET #n0 = :v0',
        ExpressionAttributeNames: { '#n0': 'UpdatedAt' },
        ExpressionAttributeValues: { ':v0': 1234567890 },
      });
    });

    it('updateTimestampWhenEmpty が true でも timestamp がなければ null', () => {
      expect(buildUpdateExpression({}, { updateTimestampWhenEmpty: true })).toBeNull();
    });

    it('updateTimestampWhenEmpty が true でも更新項目があれば通常どおり', () => {
      const result = buildUpdateExpression(
        { A: 1 },
        { timestamp: ts, updateTimestampWhenEmpty: true }
      );
      expect(result?.UpdateExpression).toBe('SET #n0 = :v0, #n1 = :v1');
    });

    it('配列やオブジェクトの値もそのまま渡す', () => {
      const result = buildUpdateExpression({ Arr: [1, 2], Obj: { x: 1 } });
      expect(result?.ExpressionAttributeValues).toEqual({ ':v0': [1, 2], ':v1': { x: 1 } });
    });
  });

  describe('conditionalPut', () => {
    it('should add attribute_not_exists condition', () => {
      const input = {
        TableName: 'MyTable',
        Item: { PK: 'USER#123', SK: 'PROFILE', Name: 'John' },
      };

      const result = conditionalPut(input);

      expect(result).toEqual({
        TableName: 'MyTable',
        Item: { PK: 'USER#123', SK: 'PROFILE', Name: 'John' },
        ConditionExpression: 'attribute_not_exists(PK)',
      });
    });

    it('should preserve existing properties', () => {
      const input = {
        TableName: 'MyTable',
        Item: { PK: 'USER#123', SK: 'PROFILE' },
        ReturnValues: 'ALL_OLD' as const,
      };

      const result = conditionalPut(input);

      expect(result.ReturnValues).toBe('ALL_OLD');
      expect(result.ConditionExpression).toBe('attribute_not_exists(PK)');
    });
  });

  describe('conditionalUpdate', () => {
    it('should add attribute_exists condition', () => {
      const input = {
        TableName: 'MyTable',
        Key: { PK: 'USER#123', SK: 'PROFILE' },
        UpdateExpression: 'SET #name = :name',
        ExpressionAttributeNames: { '#name': 'Name' },
        ExpressionAttributeValues: { ':name': 'John' },
      };

      const result = conditionalUpdate(input);

      expect(result).toEqual({
        TableName: 'MyTable',
        Key: { PK: 'USER#123', SK: 'PROFILE' },
        UpdateExpression: 'SET #name = :name',
        ExpressionAttributeNames: { '#name': 'Name' },
        ExpressionAttributeValues: { ':name': 'John' },
        ConditionExpression: 'attribute_exists(PK)',
      });
    });

    it('should preserve existing properties', () => {
      const input = {
        TableName: 'MyTable',
        Key: { PK: 'USER#123', SK: 'PROFILE' },
        UpdateExpression: 'SET #name = :name',
        ExpressionAttributeNames: { '#name': 'Name' },
        ExpressionAttributeValues: { ':name': 'John' },
        ReturnValues: 'ALL_NEW' as const,
      };

      const result = conditionalUpdate(input);

      expect(result.ReturnValues).toBe('ALL_NEW');
      expect(result.ConditionExpression).toBe('attribute_exists(PK)');
    });
  });

  describe('conditionalDelete', () => {
    it('should add attribute_exists condition', () => {
      const input = {
        TableName: 'MyTable',
        Key: { PK: 'USER#123', SK: 'PROFILE' },
      };

      const result = conditionalDelete(input);

      expect(result).toEqual({
        TableName: 'MyTable',
        Key: { PK: 'USER#123', SK: 'PROFILE' },
        ConditionExpression: 'attribute_exists(PK)',
      });
    });

    it('should preserve existing properties', () => {
      const input = {
        TableName: 'MyTable',
        Key: { PK: 'USER#123', SK: 'PROFILE' },
        ReturnValues: 'ALL_OLD' as const,
      };

      const result = conditionalDelete(input);

      expect(result.ReturnValues).toBe('ALL_OLD');
      expect(result.ConditionExpression).toBe('attribute_exists(PK)');
    });
  });
});
