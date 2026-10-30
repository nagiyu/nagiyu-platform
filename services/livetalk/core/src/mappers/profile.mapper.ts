import {
  immutablePatchValue,
  optionalPatchValue,
  readTimestamp,
  requiredPatchValue,
  validateBooleanField,
  validateObjectField,
  validateStringField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
} from '@nagiyu/aws';
import type {
  AgeVerification,
  ConsentRecord,
  ProfileEntity,
  ProfileKey,
  UserConsents,
} from '../entities/profile.entity.js';
import { buildProfileGSI1PK, buildProfileSK, buildUserPK } from './keys.js';

function consentRecordToItem(record: ConsentRecord): DynamoDBAttributes {
  return { Version: record.version, AgreedAt: record.agreedAt };
}

function consentRecordToEntity(raw: unknown, name: string): ConsentRecord {
  const obj = validateObjectField(raw, name);
  return {
    version: validateStringField(obj['Version'], `${name}.Version`),
    agreedAt: readTimestamp(obj, 'AgreedAt'),
  };
}

function ageVerificationToItem(verification: AgeVerification): DynamoDBAttributes {
  return { Value: verification.value, VerifiedAt: verification.verifiedAt };
}

function ageVerificationToEntity(raw: unknown): AgeVerification {
  const obj = validateObjectField(raw, 'AgeVerified');
  return {
    value: validateBooleanField(obj['Value'], 'AgeVerified.Value'),
    verifiedAt: readTimestamp(obj, 'VerifiedAt'),
  };
}

/** 保存の形 (PascalCase) へ。未設定の同意は属性ごと書かない。 */
function consentsToItem(consents: UserConsents): DynamoDBAttributes {
  return {
    ...(consents.termsAgreed !== undefined && {
      TermsAgreed: consentRecordToItem(consents.termsAgreed),
    }),
    ...(consents.privacyAgreed !== undefined && {
      PrivacyAgreed: consentRecordToItem(consents.privacyAgreed),
    }),
    ...(consents.ageVerified !== undefined && {
      AgeVerified: ageVerificationToItem(consents.ageVerified),
    }),
  };
}

function consentsToEntity(raw: unknown): UserConsents {
  const obj = validateObjectField(raw, 'Consents');
  return {
    ...(obj['TermsAgreed'] !== undefined && {
      termsAgreed: consentRecordToEntity(obj['TermsAgreed'], 'TermsAgreed'),
    }),
    ...(obj['PrivacyAgreed'] !== undefined && {
      privacyAgreed: consentRecordToEntity(obj['PrivacyAgreed'], 'PrivacyAgreed'),
    }),
    ...(obj['AgeVerified'] !== undefined && {
      ageVerified: ageVerificationToEntity(obj['AgeVerified']),
    }),
  };
}

export class ProfileMapper implements EntityMapper<ProfileEntity, ProfileKey> {
  public readonly entityType = 'Profile';

  public buildKeys(key: ProfileKey): DynamoDBKey {
    return { PK: buildUserPK(key.userId), SK: buildProfileSK() };
  }

  public getKey(entity: ProfileEntity): ProfileKey {
    return { userId: entity.userId };
  }

  public toItem(entity: ProfileEntity): DynamoDBAttributes {
    return {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      UserID: entity.userId,
      LastActiveAt: entity.lastActiveAt,
      CreatedAt: entity.createdAt,
      UpdatedAt: entity.updatedAt,
      // Profile だけを索引化する sparse GSI。GSI1SK は USER# なしの生の UserID
      GSI1PK: buildProfileGSI1PK(),
      GSI1SK: entity.userId,
      ...(entity.consents !== undefined && { Consents: consentsToItem(entity.consents) }),
    };
  }

  /**
   * userId と createdAt は作成後に変えられないため、含めると拒否する。
   * GSI1 の属性は key から付け直し、patch に識別子を混ぜさせない。
   */
  public toUpdateAttributes(
    changes: EntityPatch<ProfileEntity>,
    key: ProfileKey
  ): DynamoDBAttributes {
    const consents = optionalPatchValue(changes.consents);
    return {
      UserID: immutablePatchValue(changes.userId, 'UserID'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      LastActiveAt: requiredPatchValue(changes.lastActiveAt, 'LastActiveAt'),
      Consents:
        consents === undefined || typeof consents === 'symbol'
          ? consents
          : consentsToItem(consents),
      GSI1PK: buildProfileGSI1PK(),
      GSI1SK: key.userId,
    };
  }

  public toEntity(item: DynamoDBAttributes): ProfileEntity {
    return {
      userId: validateStringField(item.UserID, 'UserID'),
      lastActiveAt: readTimestamp(item, 'LastActiveAt'),
      createdAt: readTimestamp(item, 'CreatedAt'),
      updatedAt: readTimestamp(item, 'UpdatedAt'),
      ...(item.Consents !== undefined && { consents: consentsToEntity(item.Consents) }),
    };
  }
}
