import {
  buildUpdateExpression,
  conditionalPut,
  conditionalUpdate,
  conditionalDelete,
} from '../../../src/dynamodb/helpers.js';

describe('helpers', () => {
  describe('buildUpdateExpression', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should build update expression with single field', () => {
      const result = buildUpdateExpression({ Name: 'John Doe' });

      expect(result.updateExpression).toBe('SET #field0 = :value0, #updatedAt = :updatedAt');
      expect(result.expressionAttributeNames).toEqual({
        '#field0': 'Name',
        '#updatedAt': 'UpdatedAt',
      });
      expect(result.expressionAttributeValues).toEqual({
        ':value0': 'John Doe',
        ':updatedAt': Date.now(),
      });
    });

    it('should build update expression with multiple fields', () => {
      const result = buildUpdateExpression({
        Name: 'John Doe',
        Email: 'john@example.com',
        Age: 30,
      });

      expect(result.updateExpression).toBe(
        'SET #field0 = :value0, #field1 = :value1, #field2 = :value2, #updatedAt = :updatedAt'
      );
      expect(result.expressionAttributeNames).toEqual({
        '#field0': 'Name',
        '#field1': 'Email',
        '#field2': 'Age',
        '#updatedAt': 'UpdatedAt',
      });
      expect(result.expressionAttributeValues).toEqual({
        ':value0': 'John Doe',
        ':value1': 'john@example.com',
        ':value2': 30,
        ':updatedAt': Date.now(),
      });
    });

    it('should not add updatedAt when autoUpdateTimestamp is false', () => {
      const result = buildUpdateExpression({ Name: 'John Doe' }, { autoUpdateTimestamp: false });

      expect(result.updateExpression).toBe('SET #field0 = :value0');
      expect(result.expressionAttributeNames).toEqual({
        '#field0': 'Name',
      });
      expect(result.expressionAttributeValues).toEqual({
        ':value0': 'John Doe',
      });
    });

    it('should handle empty updates object', () => {
      const result = buildUpdateExpression({});

      expect(result.updateExpression).toBe('SET #updatedAt = :updatedAt');
      expect(result.expressionAttributeNames).toEqual({
        '#updatedAt': 'UpdatedAt',
      });
      expect(result.expressionAttributeValues).toEqual({
        ':updatedAt': Date.now(),
      });
    });

    it('should handle various value types', () => {
      const result = buildUpdateExpression({
        StringField: 'text',
        NumberField: 42,
        BooleanField: true,
        NullField: null,
        ArrayField: [1, 2, 3],
        ObjectField: { nested: 'value' },
      });

      expect(result.expressionAttributeValues[':value0']).toBe('text');
      expect(result.expressionAttributeValues[':value1']).toBe(42);
      expect(result.expressionAttributeValues[':value2']).toBe(true);
      expect(result.expressionAttributeValues[':value3']).toBeNull();
      expect(result.expressionAttributeValues[':value4']).toEqual([1, 2, 3]);
      expect(result.expressionAttributeValues[':value5']).toEqual({ nested: 'value' });
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
