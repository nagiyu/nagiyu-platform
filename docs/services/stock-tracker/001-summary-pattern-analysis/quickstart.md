# クイックスタートガイド: Stock Tracker サマリー日足パターン分析

**ブランチ**: `001-summary-pattern-analysis` | **フェーズ**: Phase 1 設計出力

---

## 前提条件

- Node.js 22+ / npm がインストール済み
- AWS 認証情報が設定済み（開発環境の DynamoDB にアクセスできること）
- リポジトリルートで `npm install` が完了済み

---

## 1. セットアップ

```bash
# リポジトリルートで依存パッケージをインストール
npm install

# 依存関係順にビルド（共通ライブラリ → core → batch / web）
npm run build --workspace @nagiyu/common
npm run build --workspace @nagiyu/stock-tracker-core
npm run build --workspace @nagiyu/stock-tracker-batch
npm run build --workspace @nagiyu/stock-tracker-web
```

> **Note**: `batch` と `web` のビルドは開発時には省略可能。ユニットテストは `core` のビルドのみで実行できる。E2E テストや最終確認時は全パッケージのビルドが必要。

---

## 2. パターン実装の開発フロー

### 新しいパターンクラスを追加する場合

1. `services/stock-tracker/core/src/patterns/` に新ファイルを作成
2. `CandlestickPattern` を継承し、`definition` と `analyze()` を実装
3. `pattern-registry.ts` の `PATTERN_REGISTRY` 配列に新インスタンスを追加
4. `core/src/index.ts` に新クラスのエクスポートを追加

```typescript
// pattern-registry.ts への追加例
import { NewPattern } from './new-pattern.js';

export const PATTERN_REGISTRY: readonly CandlestickPattern[] = [
  new MorningStar(),
  new EveningStar(),
  new NewPattern(),  // ← 追加するだけ
];
```

---

## 3. ユニットテストの実行

### core パッケージ（パターンロジック）

```bash
# 全ユニットテスト
npm run test --workspace @nagiyu/stock-tracker-core

# ウォッチモード（TDD 開発時）
npm run test:watch --workspace @nagiyu/stock-tracker-core

# カバレッジ確認（80% 以上が必要）
npm run test:coverage --workspace @nagiyu/stock-tracker-core
```

テストファイルの配置場所:
```
services/stock-tracker/core/tests/unit/patterns/
├── morning-star.test.ts
├── evening-star.test.ts
└── pattern-analyzer.test.ts
```

テスト命名規則:
```typescript
describe('パターン分析') {
  describe('MorningStar') {
    it('正常系: 3本以上のデータで三川明けの明星が成立する場合 MATCHED を返す')
    it('正常系: 条件が成立しない場合 NOT_MATCHED を返す')
    it('エッジケース: データがちょうど3本の場合 MATCHED/NOT_MATCHED を正しく返す')
    it('エッジケース: データが2本の場合 INSUFFICIENT_DATA を返す')
    it('エッジケース: データが1本の場合 INSUFFICIENT_DATA を返す')
    it('エッジケース: データが0本の場合 INSUFFICIENT_DATA を返す')
    it('境界値: 実体サイズが大きい実体閾値（0.3）丁度の場合 NOT_MATCHED を返す')
    it('境界値: 実体サイズが大きい実体閾値（0.3）を超える場合 条件1を満たす')
    it('境界値: 実体サイズが小さい実体閾値（0.1）丁度の場合 条件2を満たす')
    it('境界値: 実体サイズが小さい実体閾値（0.1）を超える場合 条件2を満たさない')
  }
  describe('EveningStar') {
    // 同様のテストケースを実装
  }
  describe('PatternAnalyzer') {
    it('正常系: 全パターンを実行し BuyPatternCount / SellPatternCount を正しく集計する')
    it('正常系: MATCHED パターンのみをカウントする（INSUFFICIENT_DATA はカウント外）')
  }
}
```

### batch パッケージ（サマリーバッチ）

```bash
npm run test --workspace @nagiyu/stock-tracker-batch
npm run test:coverage --workspace @nagiyu/stock-tracker-batch
```

### web パッケージ（API ルート・UI）

```bash
npm run test --workspace @nagiyu/stock-tracker-web
npm run test:coverage --workspace @nagiyu/stock-tracker-web
```

---

## 4. Lint・フォーマットの確認

```bash
# core
npm run lint --workspace @nagiyu/stock-tracker-core
npm run format:check --workspace @nagiyu/stock-tracker-core

# batch
npm run lint --workspace @nagiyu/stock-tracker-batch
npm run format:check --workspace @nagiyu/stock-tracker-batch

# web
npm run lint --workspace @nagiyu/stock-tracker-web
npm run format:check --workspace @nagiyu/stock-tracker-web
```

自動フォーマット修正:
```bash
npm run format --workspace @nagiyu/stock-tracker-core
npm run format --workspace @nagiyu/stock-tracker-batch
npm run format --workspace @nagiyu/stock-tracker-web
```

---

## 5. ローカル開発サーバーの起動

```bash
# web 開発サーバー（Next.js）
npm run dev --workspace @nagiyu/stock-tracker-web
# → http://localhost:3000 でアクセス
# → http://localhost:3000/summaries でサマリー画面を確認
```

環境変数（`.env.local` に設定）:
```env
DYNAMODB_TABLE_NAME=nagiyu-stock-tracker-dev
AWS_REGION=ap-northeast-1
NEXTAUTH_SECRET=your-secret
NEXTAUTH_URL=http://localhost:3000
```

---

## 6. E2E テストの実行

```bash
cd services/stock-tracker/web

# E2E テスト全実行
npm run test:e2e --workspace @nagiyu/stock-tracker-web

# UI モードで実行（デバッグ用）
npm run test:e2e:ui --workspace @nagiyu/stock-tracker-web

# 本機能のテストのみ実行
npx playwright test tests/e2e/summary-display.spec.ts
```

E2E テストの対象画面: `tests/e2e/summary-display.spec.ts`
- サマリー一覧: 買い件数・売り件数カラムの表示確認
- 詳細ダイアログ: 各パターンの該当有無・ツールチップ確認

---

## 7. バッチ処理のローカルテスト

```bash
# unit テストで summary バッチをテスト
npm run test --workspace @nagiyu/stock-tracker-batch -- --testPathPattern=summary

# バッチを Lambda ローカルで実行する場合（SAM CLI が必要）
# cd services/stock-tracker/infra
# sam local invoke SummaryBatchFunction
```

---

## 8. ビルド（本番用）

```bash
# 依存関係順でビルド（並列ビルドは禁止: 憲法 V 準拠）
npm run build --workspace @nagiyu/stock-tracker-core
npm run build --workspace @nagiyu/stock-tracker-batch
npm run build --workspace @nagiyu/stock-tracker-web
```

---

## 9. 本機能の実装チェックリスト

### core パッケージ

- [ ] `core/src/types.ts` に `PatternStatus`、`PatternSignalType`、`PatternDefinition`、`PatternResults` を追加
- [ ] `core/src/patterns/candlestick-pattern.ts` - 抽象基底クラス実装
- [ ] `core/src/patterns/morning-star.ts` - 三川明けの明星実装
- [ ] `core/src/patterns/evening-star.ts` - 三川宵の明星実装
- [ ] `core/src/patterns/pattern-registry.ts` - レジストリ定義
- [ ] `core/src/patterns/pattern-analyzer.ts` - アナライザ実装
- [ ] `core/src/entities/daily-summary.entity.ts` - `PatternResults` 等フィールド追加
- [ ] `core/src/mappers/daily-summary.mapper.ts` - 新フィールドのマッピング追加
- [ ] `core/src/index.ts` - 新クラス・型のエクスポート追加
- [ ] ユニットテスト追加（カバレッジ 80% 以上）

### batch パッケージ

- [ ] `batch/src/summary.ts` - 50本日足取得 + パターン分析 + upsert 統合
- [ ] ユニットテスト更新

### web パッケージ

- [ ] `web/types/stock.ts` - `PatternDetail`、`TickerSummary` 拡張（`buyPatternCount`・`sellPatternCount`・`patternDetails` フィールド追加）
- [ ] `web/app/api/summaries/route.ts` - パターン情報をレスポンスに含める
- [ ] `web/app/summaries/page.tsx` - 買い/売りカラム追加 + 詳細ダイアログ拡張
- [ ] ユニットテスト更新
- [ ] E2E テスト更新（`tests/e2e/summary-display.spec.ts`）
