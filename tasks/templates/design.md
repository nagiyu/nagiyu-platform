# {タスク名} - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/services/{service}/architecture.md に ADR として抽出し、
    tasks/{feature-name}/ ディレクトリごと削除します。

    入力: tasks/{feature-name}/requirements.md
    次に作成するドキュメント: tasks/{feature-name}/tasks.md
-->

## API 仕様

<!-- [任意] 外部公開エンドポイントがある場合のみ記述する -->

### ベース URL・認証

<!-- 認証方式（JWT / Cookie / API Key）とベース URL を記述する -->

### エンドポイント一覧

| メソッド | パス | 説明 | 認証 |
|---------|------|------|------|
| GET | /api/... | ... | 要 |

### エンドポイント詳細

#### {メソッド} {パス}

**リクエスト**

```typescript
// パラメータ・ボディの型定義
```

**レスポンス（成功）**

```typescript
// 成功時のレスポンス型定義
```

**エラーレスポンス**

| ステータス | エラーコード | 説明 |
|-----------|------------|------|
| 400 | VALIDATION_ERROR | ... |
| 404 | NOT_FOUND | ... |

---

## データモデル

### 論理モデル

<!-- エンティティ・属性・型定義を記述する。DB に依存しない表現で。 -->

```typescript
type {Entity} = {
    id: string;
    // ...
};
```

### 物理モデル

<!-- DynamoDB 設計・RDB スキーマなど、DB に依存した物理設計を記述する -->

#### DynamoDB テーブル設計（DynamoDB を使用する場合）

| 属性 | 型 | 説明 |
|-----|----|----|
| PK | string | `{ENTITY}#{id}` |
| SK | string | `{ENTITY}#{id}` |

**GSI**

| GSI 名 | PK | SK | 用途 |
|--------|----|----|------|
| GSI1 | ... | ... | ... |

**アクセスパターン**

| 操作 | キー設計 |
|------|---------|
| ... | ... |

---

## コンポーネント設計

### パッケージ責務分担

<!-- core / web / batch それぞれが担う責務を記述する -->

| パッケージ | 責務 |
|----------|------|
| `{service}/core` | ビジネスロジック・リポジトリインターフェース |
| `{service}/web` | UI・API Routes |
| `{service}/batch` | バッチ処理（該当する場合） |

### 実装モジュール一覧

<!-- 実装するクラス・関数・モジュールを列挙する -->

**core**

| モジュール | パス | 役割 |
|----------|------|------|
| `{Repository}` | `core/src/repositories/{name}.ts` | ... |
| `{function}` | `core/src/libs/{name}.ts` | ... |

**web**

| モジュール | パス | 役割 |
|----------|------|------|
| `{Component}` | `web/src/components/{name}.tsx` | ... |
| `{Route}` | `web/src/app/api/{path}/route.ts` | ... |

### モジュール間インターフェース

<!-- core が export する主要な型・関数のシグネチャを記述する -->

```typescript
// core/src/repositories/{name}.ts
interface I{Repository} {
    // ...
}

// core/src/libs/{name}.ts
function {functionName}(params: {Params}): Promise<{Result}>;
```

---

## 実装上の注意点

### 依存関係・前提条件

<!-- 実装開始前に満たされている必要がある条件を記述する -->

- ...

### パフォーマンス考慮事項

<!-- キャッシュ・クエリ最適化・バッチサイズなど -->

- ...

### セキュリティ考慮事項

<!-- 認可チェック・入力バリデーション・機密データの取り扱い -->

- ...

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `docs/services/{service}/requirements.md` に統合すること：
      <!-- 追加・変更されたユースケースや機能要件があれば記述 -->
- [ ] `docs/services/{service}/external-design.md` に統合すること（UI の変更があれば）：
      <!-- 画面設計・データモデルの変更があれば記述 -->
- [ ] `docs/services/{service}/architecture.md` に ADR として追記すること（重要な設計決定があれば）：
      <!-- 例: DB の選定理由、認証方式の決定、外部サービス依存の設計方針など -->
