---
sources:
  - libs/common/src/auth/role-grants.ts
sources_hash: 304799deaf33aa0d6e2fdb8a51bfe7b6d01e4fd1787a21ad36f2290fc91171ff
---

# 課金の権利

手動で付けたロールとは別に、出どころと有効期限を持つ「権利」としてロールを持つための型と、有効なロールの算出。メインの `@nagiyu/common` から import する。

## 使い方

| 関数 | 引数 | 戻り値 |
|---|---|---|
| `getRoleGrantStatus(grant, now)` | 権利、判定時刻 (Unix ミリ秒) | `active` / `expired` / `revoked` |
| `isRoleGrantActive(grant, now)` | 同上 | 状態が `active` なら `true` |
| `getEffectiveRoles(roles, grants, now)` | 手動で付けたロール ID の配列、権利の配列 (無効なものを含んでよい)、判定時刻 | 有効なロール ID の配列 |

```typescript
const effective = getEffectiveRoles(user.roles, user.roleGrants ?? [], Date.now());
```

## 権利 (`RoleGrant`)

| 項目 | 内容 |
|---|---|
| `grantId` | 権利の ID (UUID v4) |
| `roleId` | 付与するロールの ID (`ROLES` のキー) |
| `source` | 出どころ。`manual` または `stripe` |
| `sourceRef` | 出どころ側の参照 (任意)。手動ならメモ、Stripe 由来では契約 ID (値は Auth が入れる。[課金の権利](../../../../services/auth/specs/term/role-grant.md)) |
| `expiresAt` | 有効期限 (任意、Unix ミリ秒)。この時刻になると無効。手動で付ける権利では必須 |
| `revokedAt` | 取り消した時刻 (任意、Unix ミリ秒)。取り消した権利も経緯のために残す |
| `grantedBy` | 手動で付けた運営者のユーザー ID (任意) |
| `createdAt` / `updatedAt` | 作成・更新の時刻 (Unix ミリ秒) |

- 権利の持ち主は、権利を保持する `User` の項目 (`roleGrants`) で決まるため、権利自体は持ち主の ID を持たない。`User` は [ロールと権限](./roles-and-permissions.md) にある
- 出どころの一覧は `ROLE_GRANT_SOURCES` の配列で、`RoleGrantSource` 型はそこから導く。出どころを増やすときはこの配列に足す。足したあとのデプロイの順序は [ユーザーテーブル](../../../../services/auth/specs/data/users.md) にある

## 振る舞い

### 権利の状態

次の順に判定して、最初に当てはまったものを返す。

| 順 | 条件 | 状態 |
|---|---|---|
| 1 | `revokedAt` がある | `revoked` |
| 2 | `expiresAt` があり、`expiresAt <= now` | `expired` |
| 3 | 上のどちらでもない | `active` |

- 判定は呼び出し側が渡す `now` だけで決まり、現在時刻は読まない
- 期限ちょうどの時刻 (`expiresAt === now`) は `expired`
- `expiresAt` が無い権利は、取り消さない限り `active` のまま

### 有効なロールの算出

1. 手動で付けたロール ID を順に並べる
2. 権利を配列の順に見て、`active` なものの `roleId` を後ろに足す
3. 重複を除く。最初に現れた位置が残る

結果は、手動ロールが先、権利のロールが後の順になる。`roleId` が `ROLES` に定義されているかは確かめない。

## 理由

- 取り消しを期限より優先する。取り消し済みで期限も過ぎた権利は「取り消し」と表示したいため
