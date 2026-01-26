# ロギング機能

## 概要

本ドキュメントは、`@nagiyu/common` に実装するロギング機能の詳細設計を定義します。

### 目的

プラットフォーム全体で統一されたロギング機能を提供し、以下の課題を解決します：

- **ログの検索性**: JSON形式の構造化ログにより、検索・解析が容易になる
- **コンテキスト情報の充実**: エラー発生時のユーザーID、リクエストID等を記録可能にする
- **ログレベル管理**: 環境や用途に応じて適切なログレベルで出力
- **統一性の確保**: サービス間で一貫したロギング方法を提供

---

## 要件定義

### 機能要件

#### 1. ログレベル管理

以下の4つのログレベルをサポートします：

| レベル  | 用途                                       | 例                                   |
| ------- | ------------------------------------------ | ------------------------------------ |
| DEBUG   | 開発時のデバッグ情報                       | 変数の値、関数の呼び出しトレース     |
| INFO    | 通常の動作ログ                             | リクエスト受信、処理完了             |
| WARN    | 警告（システムは動作中だが注意が必要）     | 非推奨APIの使用、リトライ実行        |
| ERROR   | エラー（要対応）                           | API呼び出し失敗、データベースエラー  |

#### 2. 構造化ログ出力

- **フォーマット**: JSON形式で出力（全環境統一）
- **必須フィールド**:
    - `timestamp`: ISO 8601形式のタイムスタンプ
    - `level`: ログレベル（"DEBUG", "INFO", "WARN", "ERROR"）
    - `message`: ログメッセージ（文字列）
- **オプションフィールド**:
    - `context`: コンテキスト情報（オブジェクト）

#### 3. コンテキスト情報

ログ出力時に、以下のようなコンテキスト情報をオプション引数で渡せるようにします：

- ユーザーID
- リクエストID
- エラーオブジェクト（エラーメッセージ、スタックトレース）
- その他のカスタム情報

```typescript
logger.error('Failed to process request', {
    error: error.message,
    stack: error.stack,
    userId: 'user123',
    requestId: 'req-456'
});
```

#### 4. 環境変数による制御

- **環境変数名**: `LOG_LEVEL`
- **指定可能な値**: "DEBUG", "INFO", "WARN", "ERROR"
- **デフォルト値**: "INFO"
- **動作**: 指定されたレベル以上のログのみ出力

例：
- `LOG_LEVEL=WARN` の場合、WARN と ERROR のみ出力
- `LOG_LEVEL=DEBUG` の場合、すべてのログを出力

### 非機能要件

#### 1. フレームワーク非依存

- **原則**: Node.js標準ライブラリのみ使用
- **理由**: `@nagiyu/common` は完全フレームワーク非依存のライブラリとして設計
- **制約**: 外部ライブラリへの依存は禁止

#### 2. 軽量性

- **実装方式**: `console` ベースの軽量ラッパー
- **理由**: パフォーマンスへの影響を最小限に抑える
- **メリット**: 追加のランタイムコストがほぼゼロ

#### 3. 型安全性

- **TypeScript strict mode**: 必須
- **型定義**: すべての公開APIに対して厳格な型定義を提供
- **理由**: コンパイル時に型エラーを検出し、安全性を確保

#### 4. テスト容易性

- **カバレッジ目標**: 80%以上
- **テスト対象**: すべてのログレベル、環境変数の動作、エラーハンドリング
- **モック化**: console メソッドをモック化してテスト可能

---

## 設計仕様

### アーキテクチャ設計

```
libs/common/src/logger/
├── types.ts          # 型定義
├── logger.ts         # ロガー本体
└── index.ts          # エクスポート
```

**設計方針**:
- **シンプルさ**: 必要最小限の機能のみ実装
- **拡張性**: 将来的にエラートラッキングサービスとの統合を考慮した設計
- **責務の明確化**: ログの整形と出力に集中

### 型定義の詳細

#### LogLevel 型

```typescript
/**
 * ログレベル
 * - DEBUG: 開発時のデバッグ情報
 * - INFO: 通常の動作ログ
 * - WARN: 警告（システムは動作中）
 * - ERROR: エラー（要対応）
 */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
```

#### LogContext 型

```typescript
/**
 * ログのコンテキスト情報
 * 任意のキー・値ペアを格納可能
 */
export type LogContext = Record<string, unknown>;
```

#### LogEntry 型

```typescript
/**
 * ログエントリの構造
 */
export interface LogEntry {
    /** ISO 8601形式のタイムスタンプ */
    timestamp: string;
    /** ログレベル */
    level: LogLevel;
    /** ログメッセージ */
    message: string;
    /** オプションのコンテキスト情報 */
    context?: LogContext;
}
```

#### Logger インターフェース

```typescript
/**
 * ロガーインターフェース
 */
export interface Logger {
    /**
     * DEBUGレベルのログを出力
     * @param message - ログメッセージ
     * @param context - オプションのコンテキスト情報
     */
    debug(message: string, context?: LogContext): void;

    /**
     * INFOレベルのログを出力
     * @param message - ログメッセージ
     * @param context - オプションのコンテキスト情報
     */
    info(message: string, context?: LogContext): void;

    /**
     * WARNレベルのログを出力
     * @param message - ログメッセージ
     * @param context - オプションのコンテキスト情報
     */
    warn(message: string, context?: LogContext): void;

    /**
     * ERRORレベルのログを出力
     * @param message - ログメッセージ
     * @param context - オプションのコンテキスト情報
     */
    error(message: string, context?: LogContext): void;
}
```

---

## API 仕様

### 関数シグネチャ

#### logger オブジェクト

```typescript
export const logger: Logger;
```

グローバルに使用できるロガーインスタンスを提供します。

#### 各ログレベルメソッド

```typescript
logger.debug(message: string, context?: LogContext): void;
logger.info(message: string, context?: LogContext): void;
logger.warn(message: string, context?: LogContext): void;
logger.error(message: string, context?: LogContext): void;
```

**引数**:
- `message`: ログメッセージ（必須）
- `context`: コンテキスト情報（オプション）

**戻り値**: なし（`void`）

### ログレベルの定義

| レベル | 数値優先度 | 環境変数指定 | 用途               |
| ------ | ---------- | ------------ | ------------------ |
| DEBUG  | 0          | "DEBUG"      | デバッグ情報       |
| INFO   | 1          | "INFO"       | 通常ログ           |
| WARN   | 2          | "WARN"       | 警告               |
| ERROR  | 3          | "ERROR"      | エラー             |

**ログレベルの比較**:
- 各レベルには数値優先度が割り当てられる
- 環境変数 `LOG_LEVEL` で指定されたレベル以上のログのみ出力
- 例: `LOG_LEVEL=WARN` の場合、WARN (優先度2) と ERROR (優先度3) のみ出力

### 環境変数の仕様

#### LOG_LEVEL

- **型**: 文字列
- **指定可能な値**: "DEBUG", "INFO", "WARN", "ERROR"
- **デフォルト値**: "INFO"
- **大文字小文字**: 大文字のみ受け付ける
- **無効な値の場合**: デフォルト値 "INFO" を使用し、警告を出力
- **未設定の場合**: デフォルト値 "INFO" を使用

**設定例**:

```bash
# .env.local
LOG_LEVEL=DEBUG

# 本番環境
LOG_LEVEL=WARN
```

---

## ログ出力フォーマット仕様

### JSON スキーマ

すべてのログは以下のJSON形式で出力されます：

```json
{
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "required": ["timestamp", "level", "message"],
    "properties": {
        "timestamp": {
            "type": "string",
            "format": "date-time",
            "description": "ISO 8601形式のタイムスタンプ (例: 2026-01-23T12:34:56.789Z)"
        },
        "level": {
            "type": "string",
            "enum": ["DEBUG", "INFO", "WARN", "ERROR"],
            "description": "ログレベル"
        },
        "message": {
            "type": "string",
            "description": "ログメッセージ"
        },
        "context": {
            "type": "object",
            "description": "オプションのコンテキスト情報",
            "additionalProperties": true
        }
    }
}
```

### 出力例

#### 基本的なログ

```json
{
    "timestamp": "2026-01-23T12:34:56.789Z",
    "level": "INFO",
    "message": "User logged in"
}
```

#### コンテキスト情報付きログ

```json
{
    "timestamp": "2026-01-23T12:34:56.789Z",
    "level": "INFO",
    "message": "User logged in",
    "context": {
        "userId": "user123",
        "sessionId": "session-456"
    }
}
```

#### エラーログ

```json
{
    "timestamp": "2026-01-23T12:34:56.789Z",
    "level": "ERROR",
    "message": "Failed to process request",
    "context": {
        "error": "Database connection failed",
        "stack": "Error: Database connection failed\n    at Object.connect (db.ts:45:10)\n    at processRequest (api.ts:23:5)",
        "userId": "user123",
        "requestId": "req-456"
    }
}
```

#### 警告ログ

```json
{
    "timestamp": "2026-01-23T12:34:56.789Z",
    "level": "WARN",
    "message": "Deprecated API usage detected",
    "context": {
        "api": "/api/v1/old-endpoint",
        "deprecationDate": "2026-12-31"
    }
}
```

### 出力先

- **標準出力 (stdout)**: INFO, DEBUG レベルのログ
- **標準エラー出力 (stderr)**: WARN, ERROR レベルのログ

**理由**: エラーと警告を標準エラー出力に分離することで、ログ集約システムでの分類が容易になります。

---

## 使用例

### 基本的な使用方法

```typescript
import { logger } from '@nagiyu/common';

// DEBUGレベル
logger.debug('Debugging information');

// INFOレベル
logger.info('Normal operation log');

// WARNレベル
logger.warn('Warning message');

// ERRORレベル
logger.error('Error occurred');
```

### コンテキスト情報付きログ

```typescript
import { logger } from '@nagiyu/common';

// ユーザー情報付きログ
logger.info('User logged in', {
    userId: 'user123',
    timestamp: Date.now()
});

// リクエスト情報付きログ
logger.info('API request received', {
    method: 'POST',
    path: '/api/data',
    requestId: 'req-789'
});
```

### エラーログの記録

```typescript
import { logger } from '@nagiyu/common';

try {
    // 何らかの処理
    await processData(data);
} catch (error) {
    logger.error('Failed to process data', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        userId: currentUserId,
        requestId: currentRequestId
    });
    
    // エラー処理を続ける
    throw error;
}
```

### Next.js API ルートでの使用例

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@nagiyu/common';

export async function GET(request: NextRequest) {
    const requestId = crypto.randomUUID();
    
    logger.info('API request received', {
        method: 'GET',
        path: request.nextUrl.pathname,
        requestId
    });
    
    try {
        const data = await fetchData();
        
        logger.info('Data fetched successfully', {
            requestId,
            recordCount: data.length
        });
        
        return NextResponse.json(data);
    } catch (error) {
        logger.error('Failed to fetch data', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            requestId
        });
        
        return NextResponse.json(
            { error: 'INTERNAL_ERROR' },
            { status: 500 }
        );
    }
}
```

### 環境変数による制御

```bash
# 開発環境: すべてのログを出力
LOG_LEVEL=DEBUG npm run dev

# 本番環境: 警告とエラーのみ出力
LOG_LEVEL=WARN npm start
```

---

## テスト要件

### テストカバレッジ目標

- **全体**: 80%以上
- **重点領域**: ログレベルフィルタリング、JSON整形、環境変数読み込み

### テストすべき項目

#### 1. ログレベルのフィルタリング

- [x] `LOG_LEVEL=DEBUG` の場合、すべてのレベルが出力される
- [x] `LOG_LEVEL=INFO` の場合、INFO, WARN, ERROR が出力される
- [x] `LOG_LEVEL=WARN` の場合、WARN, ERROR のみが出力される
- [x] `LOG_LEVEL=ERROR` の場合、ERROR のみが出力される
- [x] 無効な `LOG_LEVEL` の場合、デフォルト (INFO) が使用される
- [x] `LOG_LEVEL` が未設定の場合、デフォルト (INFO) が使用される

#### 2. ログ出力形式

- [x] タイムスタンプがISO 8601形式で出力される
- [x] ログレベルが正しく出力される
- [x] メッセージが正しく出力される
- [x] コンテキスト情報がない場合、context フィールドが省略される
- [x] コンテキスト情報がある場合、正しくJSON化される

#### 3. JSON形式の検証

- [x] 出力されるログが正しいJSON形式である
- [x] JSON.parse() でパース可能である
- [x] スキーマに準拠している

#### 4. コンテキスト情報

- [x] 単純な値（文字列、数値）が正しく記録される
- [x] ネストされたオブジェクトが正しく記録される
- [x] undefined や null が適切に処理される
- [x] 循環参照がある場合にエラーが発生しない（またはエラーハンドリング）

#### 5. エラーハンドリング

- [x] Error オブジェクトのメッセージとスタックトレースが記録される
- [x] カスタムエラーオブジェクトが適切に処理される
- [x] ログ出力自体が失敗した場合でもアプリケーションがクラッシュしない

#### 6. 出力先

- [x] INFO, DEBUG は stdout に出力される
- [x] WARN, ERROR は stderr に出力される

### テスト戦略

#### ユニットテスト

- **フレームワーク**: Jest
- **モック対象**: `console.log`, `console.error`, `process.env`
- **配置**: `tests/unit/logger.test.ts`

### CI/CDでのテスト実行

テストは以下のタイミングで自動実行されます：

- **Pull Request作成時**: 全テストを実行
- **マージ前**: カバレッジ80%以上を確認
- **デプロイ前**: 本番環境へのデプロイ前に全テストをパス

---

## 実装上の注意事項

### セキュリティ考慮事項

- **機密情報の記録禁止**: パスワード、トークン、APIキー等をログに含めない
- **個人情報の取り扱い**: ユーザーの個人情報をログに記録する場合は、プライバシーポリシーに準拠
- **ログの保存期間**: 本番環境でのログ保存期間を適切に設定（別途運用ドキュメントで定義）

### パフォーマンス考慮事項

- **同期処理**: ログ出力は同期的に実行（非同期化は今回のスコープ外）
- **コンテキスト情報のサイズ**: 過度に大きなオブジェクトをコンテキストに含めない
- **高頻度ログ**: パフォーマンスクリティカルな処理では DEBUG レベルを適切に使用

### 今後の拡張性

本実装は将来的な以下の機能拡張を考慮した設計となっています：

- **エラートラッキングサービス統合**: Sentry等への送信機能追加
- **ログ集約システム統合**: CloudWatch Logs, Datadog等への転送
- **ログローテーション**: ファイル出力時のローテーション機能
- **カスタムフォーマッター**: JSON以外の出力形式のサポート

---

## 関連ドキュメント

- [@nagiyu/common README](./README.md)
- [共通ライブラリ設計](../../development/shared-libraries.md)
- [コーディング規約](../../development/rules.md)
- [テスト戦略](../../development/testing.md)
