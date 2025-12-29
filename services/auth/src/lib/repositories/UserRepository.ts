import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

export interface User {
  userId: string;
  googleId: string;
  email: string;
  name: string;
  picture?: string;
  roles: string[];
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export interface UpsertUserInput {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
}

export interface UpdateUserInput {
  name?: string;
  roles?: string[];
}

export class UserRepository {
  private client: DynamoDBDocumentClient;
  private tableName: string;

  constructor() {
    const dynamoClient = new DynamoDBClient({
      region: process.env.AWS_REGION || 'ap-northeast-1',
    });
    this.client = DynamoDBDocumentClient.from(dynamoClient);
    this.tableName = process.env.DYNAMODB_TABLE_NAME || 'nagiyu-auth-users-dev';
  }

  /**
   * Get user by userId (primary key)
   */
  async getUserById(userId: string): Promise<User | null> {
    try {
      const command = new GetCommand({
        TableName: this.tableName,
        Key: { userId },
      });

      const result = await this.client.send(command);
      return result.Item ? (result.Item as User) : null;
    } catch (error) {
      console.error('Error getting user by ID:', error);
      throw error;
    }
  }

  /**
   * Get user by Google ID (using GSI)
   */
  async getUserByGoogleId(googleId: string): Promise<User | null> {
    try {
      const command = new QueryCommand({
        TableName: this.tableName,
        IndexName: 'googleId-index',
        KeyConditionExpression: 'googleId = :googleId',
        ExpressionAttributeValues: {
          ':googleId': googleId,
        },
      });

      const result = await this.client.send(command);
      return result.Items && result.Items.length > 0 ? (result.Items[0] as User) : null;
    } catch (error) {
      console.error('Error getting user by Google ID:', error);
      throw error;
    }
  }

  /**
   * Upsert user (create if not exists, update if exists)
   */
  async upsertUser(input: UpsertUserInput): Promise<User> {
    try {
      // Check if user exists
      const existingUser = await this.getUserByGoogleId(input.googleId);

      const now = new Date().toISOString();

      if (existingUser) {
        // Update existing user
        const command = new UpdateCommand({
          TableName: this.tableName,
          Key: { userId: existingUser.userId },
          UpdateExpression:
            'SET #name = :name, picture = :picture, updatedAt = :updatedAt, lastLoginAt = :lastLoginAt',
          ExpressionAttributeNames: {
            '#name': 'name',
          },
          ExpressionAttributeValues: {
            ':name': input.name,
            ':picture': input.picture,
            ':updatedAt': now,
            ':lastLoginAt': now,
          },
          ReturnValues: 'ALL_NEW',
        });

        const result = await this.client.send(command);
        return result.Attributes as User;
      } else {
        // Create new user
        const newUser: User = {
          userId: `user_${uuidv4().replace(/-/g, '')}`,
          googleId: input.googleId,
          email: input.email,
          name: input.name,
          picture: input.picture,
          roles: [],
          createdAt: now,
          updatedAt: now,
          lastLoginAt: now,
        };

        const command = new PutCommand({
          TableName: this.tableName,
          Item: newUser,
        });

        await this.client.send(command);
        return newUser;
      }
    } catch (error) {
      console.error('Error upserting user:', error);
      throw error;
    }
  }

  /**
   * Update user
   */
  async updateUser(userId: string, input: UpdateUserInput): Promise<User> {
    try {
      const updateExpressions: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, string | string[]> = {};

      if (input.name !== undefined) {
        updateExpressions.push('#name = :name');
        expressionAttributeNames['#name'] = 'name';
        expressionAttributeValues[':name'] = input.name;
      }

      if (input.roles !== undefined) {
        updateExpressions.push('roles = :roles');
        expressionAttributeValues[':roles'] = input.roles;
      }

      updateExpressions.push('updatedAt = :updatedAt');
      expressionAttributeValues[':updatedAt'] = new Date().toISOString();

      const command = new UpdateCommand({
        TableName: this.tableName,
        Key: { userId },
        UpdateExpression: 'SET ' + updateExpressions.join(', '),
        ExpressionAttributeNames:
          Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      });

      const result = await this.client.send(command);
      return result.Attributes as User;
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  /**
   * Delete user
   */
  async deleteUser(userId: string): Promise<void> {
    try {
      const command = new DeleteCommand({
        TableName: this.tableName,
        Key: { userId },
      });

      await this.client.send(command);
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  }

  /**
   * List all users
   */
  async listUsers(): Promise<User[]> {
    try {
      const command = new ScanCommand({
        TableName: this.tableName,
      });

      const result = await this.client.send(command);
      return (result.Items as User[]) || [];
    } catch (error) {
      console.error('Error listing users:', error);
      throw error;
    }
  }
}
