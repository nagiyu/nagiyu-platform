// Export DynamoDB types
export type { User, CreateUserInput, UpdateUserInput } from './types.js';

// Export DynamoDB client
export { dynamoDb, USERS_TABLE_NAME } from './dynamodb-client.js';

// Export DynamoDB repository
export { DynamoDBUserRepository, UserNotFoundError } from './repositories/dynamodb-user-repository.js';
