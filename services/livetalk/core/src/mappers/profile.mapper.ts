import {
  validateStringField,
  validateTimestampField,
  type DynamoDBItem,
  type EntityMapper,
} from '@nagiyu/aws';
import type { ProfileEntity, ProfileKey } from '../entities/profile.entity.js';
import { buildProfileSK, buildUserPK } from './keys.js';

export class ProfileMapper implements EntityMapper<ProfileEntity, ProfileKey> {
  public readonly entityType = 'Profile';

  public toItem(entity: ProfileEntity): DynamoDBItem {
    const { pk, sk } = this.buildKeys({ userId: entity.UserID });
    return {
      PK: pk,
      SK: sk,
      Type: this.entityType,
      UserID: entity.UserID,
      GoogleID: entity.GoogleID,
      DisplayName: entity.DisplayName,
      Email: entity.Email,
      LastActiveAt: entity.LastActiveAt,
      CreatedAt: entity.CreatedAt,
      UpdatedAt: entity.UpdatedAt,
    };
  }

  public toEntity(item: DynamoDBItem): ProfileEntity {
    return {
      UserID: validateStringField(item.UserID, 'UserID'),
      GoogleID: validateStringField(item.GoogleID, 'GoogleID'),
      // DisplayName は Google アカウントによっては空のことがあるため empty 許容。
      DisplayName: validateStringField(item.DisplayName, 'DisplayName', { allowEmpty: true }),
      Email: validateStringField(item.Email, 'Email', { allowEmpty: true }),
      LastActiveAt: validateTimestampField(item.LastActiveAt, 'LastActiveAt'),
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
      UpdatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
    };
  }

  public buildKeys(key: ProfileKey): { pk: string; sk: string } {
    return {
      pk: buildUserPK(key.userId),
      sk: buildProfileSK(),
    };
  }
}
