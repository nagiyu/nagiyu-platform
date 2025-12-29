# コーディング規約・べからず集

## 目的

本ドキュメントは、nagiyu-platform における実装時の必須ルールと推奨事項を定義する。

AIツール (GitHub Copilot Agent等) や開発者が実装前・実装中に確認し、一貫した品質の高いコードを維持することを目的とする。

## 基本方針

本プロジェクトは **最小限のルール** を原則としています ([docs/README.md](../README.md) 参照) 。

- **必須事項 (MUST)**: 守らないとビルドエラー、テスト失敗、セキュリティ問題が発生する可能性がある
- **推奨事項 (SHOULD)**: 可能な限り守るべき。特別な理由がない限り従うべき
- **任意 (MAY)**: 状況に応じて選択可能
- **禁止事項 (MUST NOT)**: 絶対に行ってはいけない。違反すると重大な問題が発生する

---

## 1. TypeScript / JavaScript ルール

### 1.1 型安全性

#### MUST: strict mode 必須
```typescript
// tsconfig.json
{
    "compilerOptions": {
        "strict": true
    }
}
```

**理由**: 型エラーの早期発見、コードの安全性向上
**違反時の影響**: 実行時エラー、予期しない動作

#### MUST: 型定義は types/ ディレクトリに集約
```typescript
// ❌ NG
// src/components/Button.tsx
type ButtonProps = { ... }

// ✅ OK
// src/types/components.ts
export type ButtonProps = { ... }

// src/components/Button.tsx
import type { ButtonProps } from '@/types/components';
```

**理由**: 型定義の一元管理、再利用性の向上
**違反時の影響**: 型定義の重複、メンテナンス性の低下

#### MUST: 型定義とデフォルト値をセットで定義
```typescript
// ❌ NG
type Config = {
    timeout: number;
    retries: number;
};
// 別の場所でデフォルト値を定義

// ✅ OK
type Config = {
    timeout: number;
    retries: number;
};

const DEFAULT_CONFIG: Config = {
    timeout: 3000,
    retries: 3,
};
```

**理由**: 型とデフォルト値の不整合を防ぐ
**違反時の影響**: 型エラー、初期化エラー

### 1.2 TypeScript 設定

#### MUST: configs/tsconfig.base.json で定義された共通設定を使用

```json
// services/*/tsconfig.json または libs/*/tsconfig.json
{
    "extends": "../../configs/tsconfig.base.json",
    // 必要に応じてサービス固有の設定を追加
}
```

**理由**:
- モノレポ全体で統一された TypeScript 設定を維持
- バージョン管理を一箇所（configs/tsconfig.base.json）に集約
- Next.js がビルド時に適切にトランスパイルするため、target は型チェックレベルを決めるだけ

**禁止事項**:
- サービス・ライブラリの tsconfig.json で `target`、`moduleResolution` 等の基本設定を上書きしない
- バージョン変更が必要な場合は configs/tsconfig.base.json を更新

**例外**:
- サービス固有の `paths` (パスエイリアス) 設定は許可
- ライブラリ固有の `lib`、`declaration`、`outDir` 設定は許可

### 1.3 サービス vs ライブラリ

#### MUST: サービスは Next.js 環境全体を型チェック対象に含める
```json
// services/*/tsconfig.json
{
    "include": ["**/*.ts", "**/*.tsx"],
    "exclude": ["node_modules", "e2e"]
}
```

#### MUST: ライブラリは src と tests のみを明示的に指定
```json
// libs/*/tsconfig.json
{
    "include": ["src/**/*", "tests/**/*"],
    "exclude": ["node_modules", "dist"]
}
```

#### MUST NOT: ライブラリでパスエイリアス (paths) を使用しない
```typescript
// ❌ NG (ライブラリ内部)
import { something } from '@/utils/helper';

// ✅ OK (ライブラリ内部)
import { something } from '../utils/helper';

// ✅ OK (サービス内部)
import { something } from '@/lib/utils/helper';
```

**理由**: ライブラリとして配布する際の一貫性、ビルド設定の複雑化を回避
**違反時の影響**: ビルドエラー、配布時の問題

---

## 2. React / Next.js ルール

### 2.1 状態管理

#### SHOULD: React Hooks (useState、useReducer) で管理
```typescript
// ✅ OK
const [count, setCount] = useState(0);
const [state, dispatch] = useReducer(reducer, initialState);
```

**理由**: シンプルさの維持、外部ライブラリへの依存を最小化

#### SHOULD: localStorage は永続化が必要な設定値のみ
```typescript
// ❌ NG: 一時的なUIステート
localStorage.setItem('isModalOpen', 'true');

// ✅ OK: ユーザー設定
localStorage.setItem('theme', 'dark');
```

#### MUST: localStorage は useEffect 内でアクセス (SSR対応)
```typescript
// ❌ NG
const theme = localStorage.getItem('theme');

// ✅ OK
const [theme, setTheme] = useState<string | null>(null);

useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    setTheme(savedTheme);
}, []);
```

**理由**: サーバーサイドレンダリング時に localStorage は存在しない
**違反時の影響**: SSRエラー、ハイドレーションエラー

### 2.2 ブラウザ API

#### MUST: 共通ライブラリに実装があれば優先的に使用
- `@nagiyu/browser` に実装がある場合は、直接ブラウザ API を使用せず共通ライブラリを使用
- SSR 対応、エラーハンドリング、モック化が統一される

```typescript
// ❌ NG: 共通ライブラリに実装があるのに直接使用
await navigator.clipboard.writeText(text);

// ✅ OK: 共通ライブラリを使用
import { clipboard } from '@nagiyu/browser';
await clipboard.writeText(text);
```

**理由**: エラーハンドリングの統一、テストの容易性、ブラウザ互換性の吸収
**違反時の影響**: SSRエラー、プライベートモード対応漏れ、テストが困難

### 2.3 パフォーマンス

#### SHOULD NOT: 過度な最適化は避ける
**原則**: 必要になってから対応

#### MUST: 推測ではなく計測に基づいて最適化
```typescript
// ❌ NG: 推測による最適化
const memoizedValue = useMemo(() => simpleCalculation(), []);

// ✅ OK: 計測後、必要と判断された最適化
// パフォーマンスプロファイラで計測 → ボトルネック特定 → 最適化
```

#### SHOULD: スマホファーストでモバイル環境での動作を優先
- モバイル環境でのテストを優先
- 画像の最適化 (Next.js Image コンポーネント)
- 不要な再レンダリングの削減 (React.memo、useMemo)
- バンドルサイズの監視

---

## 3. アーキテクチャルール

### 3.1 レイヤー分離

#### MUST: UI層 (components/, app/) とビジネスロジック (lib/) を明確に分離
```
src/
├── app/                    # UI層 (Next.js App Router)
├── components/             # UI層 (Reactコンポーネント)
└── lib/                    # ビジネスロジック
    └── (サービスに応じた構成)
```

**理由**: ユニットテストの容易性、コンポーネントの再利用性向上、責務の明確化
**違反時の影響**: テストが困難、コードの再利用性低下

#### MUST: lib/ 配下の構成はサービスの特性に応じて自由に選択
サービスの要件に応じて適切なパターンを選択する。以下は参考例:
- データ変換処理が中心: parser/, formatter/ など
- データアクセス層: repositories/, services/ など
- ビジネスルール: validators/, calculators/ など
- React 固有の再利用ロジック: hooks/

### 3.2 ビジネスロジックの実装

#### SHOULD: ビジネスロジックは純粋関数として実装
- 同じ入力に対して常に同じ出力を返す
- 外部状態を変更しない（副作用なし）

```typescript
// ✅ OK: 純粋関数
function calculate(a: number, b: number): number {
    return a + b;
}

// ❌ NG: 副作用あり
let total = 0;
function calculate(a: number, b: number): number {
    total = a + b;  // 外部状態の変更
    return total;
}
```

**理由**: テストの容易性、予測可能性、デバッグのしやすさ
**違反時の影響**: テストが困難、バグの混入

#### MUST: 関数間で受け渡すデータ構造を型定義
```typescript
// ✅ OK: 中間データ構造を型定義
type ProcessedData = {
    items: string[];
    metadata: Metadata;
};

function process(input: string): ProcessedData { /* ... */ }
function transform(data: ProcessedData): string { /* ... */ }
```

**理由**: 型安全性、コードの可読性向上
**違反時の影響**: 型エラー、実行時エラー

### 3.3 エラーハンドリング

#### MUST: ユーザー向けエラーは日本語で記述
```typescript
// ❌ NG
throw new Error('Invalid input');

// ✅ OK
throw new Error('入力が不正です');
```

#### MUST: エラーメッセージは定数オブジェクトで管理
```typescript
// ✅ OK
const ERROR_MESSAGES = {
    EMPTY_INPUT: '入力が空です',
    INVALID_FORMAT: 'フォーマットが不正です',
} as const;

throw new Error(ERROR_MESSAGES.EMPTY_INPUT);
```

**理由**: メッセージの一元管理、変更の容易性
**違反時の影響**: メッセージの不一致、メンテナンス性の低下

#### SHOULD: 技術的な詳細より対処方法を優先
```typescript
// ❌ NG
throw new Error('JSON parse failed at line 5');

// ✅ OK
throw new Error('データの形式が正しくありません。正しいJSON形式で入力してください');
```

---

## 4. テストルール

### 4.1 フレームワーク

#### MUST: Jest をテストランナーとして使用
#### MUST: Testing Library を React コンポーネントテストに使用
#### MUST: Playwright を E2E テストに使用

### 4.2 ディレクトリ構成

#### MUST: サービスは tests/unit/ と tests/e2e/ を持つ
```
services/*/
├── tests/
│   ├── unit/           # ユニットテスト
│   └── e2e/            # E2Eテスト
```

#### MUST: ライブラリは tests/unit/ を持つ
```
libs/*/
├── tests/
│   ├── unit/           # ユニットテスト
│   └── mocks/          # モッククラス (該当する場合)
```

#### SHOULD: 必要に応じて tests/setup.ts を作成
- ブラウザ API のモック、グローバル設定が必要な場合のみ作成

#### SHOULD: 再利用可能なモックは tests/mocks/ に配置
- インターフェースを実装したモッククラス
- 共通ライブラリは必ずモッククラスを提供
- サービス固有の複雑なロジックも検討

#### MUST: テストコードを tests/ 配下に集約し、src/ と明確に区分
```
// ❌ NG
src/
├── lib/
│   ├── parser.ts
│   └── parser.test.ts      # src/ 配下にテスト

// ✅ OK
src/
├── lib/
│   └── parser.ts
tests/
└── unit/
    └── lib/
        └── parser.test.ts
```

### 4.3 カバレッジ

#### MUST: ビジネスロジック (lib/) を重点的にテスト
#### MUST: ビジネスロジックのカバレッジ 80% 以上を確保
```typescript
// jest.config.ts
coverageThreshold: {
    global: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
    },
}
```

**理由**: 品質保証、リグレッション防止
**違反時の影響**: CI失敗、品質低下

#### SHOULD: UI 層は必要に応じてテスト (E2E でカバーされる部分は省略可)

#### MUST: Jest の coverageThreshold 設定により 80% 未満で自動失敗させる

### 4.4 モック

#### MUST NOT: 純粋関数をモックしない
```typescript
// ❌ NG: 純粋関数をモック
const mockCalculate = jest.fn((a, b) => a + b);

// ✅ OK: 純粋関数はそのまま使う
function calculate(a: number, b: number): number {
    return a + b;
}
expect(calculate(1, 2)).toBe(3);
```

**理由**: 純粋関数は副作用がなく、そのまま実行しても問題ない。モック化すると実装をテストしていないことになる
**違反時の影響**: テストの価値が低下、メンテナンス性の低下

#### MUST: 副作用がある処理をモック
- ブラウザAPI（navigator.clipboard、localStorage等）
- 外部APIリクエスト（fetch、axios等）
- ファイルシステム、データベース
- 現在時刻、ランダム値、Math.random()

```typescript
// ✅ OK: ブラウザAPIをモック
jest.mock('@nagiyu/browser', () => ({
    clipboard: mockClipboard,
}));

// ✅ OK: fetchをモック
global.fetch = jest.fn();

// ✅ OK: 現在時刻をモック
jest.useFakeTimers();
jest.setSystemTime(new Date('2024-01-01'));
```

#### MUST: 共通ライブラリはインターフェースとモッククラスを提供
```typescript
// libs/browser/src/clipboard.ts
export interface ClipboardAPI {
    writeText(text: string): Promise<void>;
    readText(): Promise<string>;
}

export class BrowserClipboard implements ClipboardAPI {
    async writeText(text: string): Promise<void> {
        if (typeof window === 'undefined') {
            throw new Error('clipboard is only available in browser');
        }
        await navigator.clipboard.writeText(text);
    }
    async readText(): Promise<string> {
        if (typeof window === 'undefined') {
            throw new Error('clipboard is only available in browser');
        }
        return await navigator.clipboard.readText();
    }
}

export const clipboard: ClipboardAPI = new BrowserClipboard();

// libs/browser/tests/mocks/clipboard.ts
export class MockClipboard implements ClipboardAPI {
    private storage = '';

    async writeText(text: string): Promise<void> {
        this.storage = text;
    }

    async readText(): Promise<string> {
        return this.storage;
    }

    // テスト用ヘルパー
    getWrittenText(): string {
        return this.storage;
    }

    reset(): void {
        this.storage = '';
    }
}
```

**理由**: 型安全性、テストの一貫性、リファクタリング耐性
**違反時の影響**: 実装変更時にテストが壊れる、型エラーの見逃し

#### SHOULD: サービス固有の複雑なロジックもインターフェース定義を検討
- ステートフルな処理
- 複数のメソッドを持つ
- 多くのテストで再利用される

#### MUST: Next.js ルーティングをモック（該当する場合）

### 4.5 E2E

#### MUST: 主要な機能フローをテスト
#### MUST: クリティカルパスをテスト
#### SHOULD: PWA 機能をテスト (PWA 対応サービスのみ)
#### MUST: chromium-desktop、chromium-mobile、webkit-mobile でテスト
#### MUST: モバイル環境を優先してテスト

**理由**: 本プロジェクトはスマホファーストのため、モバイル環境での動作を最優先
**実践**:
- テスト作成時はモバイル環境で先に確認
- CI戦略でもモバイル（chromium-mobile）を優先（integration/** ブランチでは chromium-mobile のみ）
- レイアウト崩れ、タップ領域、画面サイズ対応を重点的にチェック

### 4.6 テスト作成

#### MUST: 純粋関数を優先
#### MUST: 一つのテストで一つの検証
```typescript
// ❌ NG: 複数の検証
it('should work', () => {
    expect(parse(input1)).toBe(output1);
    expect(parse(input2)).toBe(output2);
    expect(format(data)).toBe(formatted);
});

// ✅ OK: 一つの検証
it('should parse valid input', () => {
    expect(parse(validInput)).toBe(expectedOutput);
});

it('should reject invalid input', () => {
    expect(() => parse(invalidInput)).toThrow();
});
```

#### MUST: AAA パターン (Arrange, Act, Assert) を使用
```typescript
it('should calculate total', () => {
    // Arrange
    const items = [{ price: 100 }, { price: 200 }];

    // Act
    const total = calculateTotal(items);

    // Assert
    expect(total).toBe(300);
});
```

#### MUST: ユーザー視点でテストを記述 (E2E)
#### MUST: テスト間で状態を共有しない
#### SHOULD: 安定性を優先 (不安定なテストは修正するか削除)

---

## 5. CI/CD (GitHub Actions)

### 5.1 CI戦略

本プロジェクトは **PR で静的チェックを全て完了** し、マージ時のリスクを最小化する戦略を採用する。

#### MUST: 全サービスで2段階のワークフローを実装

**Fast Verification (`integration/**` ブランチ)**:
- 対象: integration/** ブランチへの PR
- 目的: 高速フィードバックによる開発速度の維持
- 実施項目:
    1. ビルド検証 (Next.js、Docker 等)
    2. 品質チェック (ESLint、Prettier)
    3. ユニットテスト
    4. E2Eテスト (chromium-mobile のみ)
    5. **PR へのコメント報告 (全結果を表形式で表示)**

**Full Verification (develop ブランチ)**:
- 対象: develop ブランチへの PR
- 目的: 本番環境への品質保証
- 実施項目:
    1. ビルド検証 (Next.js、Docker 等)
    2. 品質チェック (ESLint、Prettier)
    3. ユニットテスト
    4. **カバレッジチェック (80% 未満で失敗)**
    5. E2Eテスト (chromium-desktop、chromium-mobile、webkit-mobile)
    6. **PR へのコメント報告 (全結果を表形式で表示)**

#### MUST: ビルド検証を実施

**Next.js サービスの場合**:
```yaml
- name: Build shared libraries
  run: |
    npm run build --workspace @nagiyu/common
    npm run build --workspace @nagiyu/browser
    npm run build --workspace @nagiyu/ui

- name: Build Next.js application
  run: npm run build --workspace <service-name>
```

**Docker を使用するサービスの場合**:
```yaml
- name: Build Docker image
  run: docker build -t <service>-verify-test -f services/<service>/Dockerfile .
```

#### MUST: インフラチェックを実施 (該当する場合)

サービスに対応する CDK スタックが infra/ 配下にある場合、インフラコードのビルドと CDK 構文チェックを実施:

```yaml
- name: Build infrastructure
  run: npm run build --workspace @nagiyu/infra

- name: CDK Synth Check
  run: npm run synth --workspace @nagiyu/infra
```

**注意**: CDK synth は全スタックを検証するため、サービス固有のスタックのみを検証したい場合は以下のように指定:
```yaml
- name: CDK Synth Check (specific stack)
  run: npm run synth --workspace @nagiyu/infra -- <StackName>
```

#### MUST: 品質チェックを実施

```yaml
- name: Run lint
  run: npm run lint --workspace <service-name>

- name: Check formatting
  run: npm run format:check --workspace <service-name>
```

#### MUST: テストを実施

**ユニットテスト**:
```yaml
- name: Run tests
  run: npm run test --workspace <service-name>
```

**カバレッジチェック (Full Verification のみ)**:
```yaml
- name: Run tests with coverage
  run: npm run test:coverage --workspace <service-name>
```

**E2Eテスト**:
- Fast: chromium-mobile のみ
- Full: chromium-desktop、chromium-mobile、webkit-mobile

#### MUST: PR へのコメント報告を実施

全ジョブの結果を PR にコメントで報告:
- ✅ 成功、❌ 失敗、⚠️ キャンセル、⏭️ スキップ
- 表形式で各ジョブの結果を表示
- ワークフロー実行へのリンクを含める

```yaml
report:
  name: Report Results to PR
  if: always()
  needs: [nextjs-build, docker-build, test, coverage, e2e-test, lint, format-check]
  permissions:
    contents: read
    pull-requests: write
```

#### MUST: 失敗時のアーティファクトを保存

E2Eテスト失敗時:
- スクリーンショット
- 動画 (該当する場合)
- Playwright レポート
- 保持期間: 30日

```yaml
- name: Upload test results
  uses: actions/upload-artifact@v4
  if: always()
  with:
    name: playwright-report
    path: services/<service>/playwright-report/
    retention-days: 30
```

#### SHOULD: CI最適化設定

- 並列実行によるジョブの高速化
- npm キャッシュの活用 (`cache: 'npm'`)
- 不安定なテストへのリトライ設定
- タイムアウト設定 (長時間実行の防止)

**理由**: 全てのチェックを PR で完了することで、マージ後のデプロイ失敗リスクを最小化
**違反時の影響**: 本番環境へのデプロイ失敗、品質低下、リリース遅延

### 5.2 ワークフロー構成

#### MUST: サービスやライブラリごとに専用の PR 検証ワークフローを作成
```yaml
# .github/workflows/hoge-verify.yml
name: Hoge Verify
```

#### MUST: ファイル名は {target}-verify.yml または {target}-verify-fast.yml / {target}-verify-full.yml
```
.github/workflows/
├── tools-verify-fast.yml
├── tools-verify-full.yml
├── common-verify.yml
└── browser-verify.yml
```

#### MUST: E2E テストを持つサービスでは 2 段階のワークフローを作成
- `*-verify-fast.yml`: integration/** ブランチ用
- `*-verify-full.yml`: develop ブランチ用

#### MUST: Verify ワークフローは PR をトリガーとし、パスフィルターを設定

```yaml
# *-verify-fast.yml / *-verify-full.yml
on:
    pull_request:
        branches:
            - develop           # Full verification
            - integration/**    # Fast verification
        paths:
            - 'services/<service>/**'
            - 'libs/**'                          # 依存ライブラリ
            - 'infra/<service>/**'               # インフラコード (該当する場合)
            - 'package.json'
            - 'package-lock.json'
            - '.github/workflows/<service>-verify-*.yml'
```

**理由**: 関連ファイル変更時のみワークフローを実行し、CI リソースを最適化

#### MUST: Deploy ワークフローは push をトリガーとし、環境を振り分ける

```yaml
# *-deploy.yml
on:
    push:
        branches:
            - develop           # dev 環境
            - integration/**    # dev 環境
            - master            # prod 環境
        paths:
            - 'services/<service>/**'
            - 'libs/**'
            - 'infra/<service>/**'
            - 'package.json'
            - 'package-lock.json'
            - '.github/workflows/<service>-deploy.yml'
    workflow_dispatch:          # 手動実行も許可

jobs:
    deploy:
        steps:
            - name: Set environment
              id: set-env
              run: |
                  if [[ "$GITHUB_REF" == 'refs/heads/master' ]]; then
                      echo "environment=prod" >> "$GITHUB_OUTPUT"
                  else
                      echo "environment=dev" >> "$GITHUB_OUTPUT"
                  fi
```

**理由**:
- Verify: PR 時に品質チェックを完了し、マージ可否を判断
- Deploy: マージ後に自動デプロイを実行
- 環境振り分け: master は prod、それ以外は dev 環境へデプロイ
- パスフィルター: 関連ファイル変更時のみデプロイを実行

#### MUST: ワークスペース指定はパッケージ名 (@nagiyu/hoge) を使用
```yaml
# ❌ NG
- run: npm run test --workspace=services/hoge

# ✅ OK
- run: npm run test --workspace=@nagiyu/hoge
```

**理由**: より明示的、リファクタリング時にも対応しやすい
**違反時の影響**: ワークフローエラー

#### MUST NOT: パス指定 (services/hoge) を使用しない

### 5.3 ビルド順序

#### MUST: 依存関係に従ってビルド順序を守る
```yaml
# ✅ OK
- name: Build shared libraries
  run: |
    npm run build --workspace @nagiyu/common
    npm run build --workspace @nagiyu/browser
    npm run build --workspace @nagiyu/ui

# ❌ NG: 並列実行のため依存関係が保証されない
- run: npm run build --workspaces
```

#### MUST: 依存関係順にビルド (common → browser → ui)

#### MUST: npm run build --workspace @nagiyu/common のように個別ビルド

#### MUST NOT: npm run build --workspaces を使用しない (並列実行のため)
**理由**: 依存関係が考慮されず、ビルドエラーが発生する可能性がある
**違反時の影響**: ビルドエラー、CI失敗

#### MUST: CI/CD でも同じ順序でビルド

---

## 6. セキュリティルール

### 6.1 入力検証

#### MUST: すべての外部入力を検証
```typescript
// ✅ OK
function parse(input: string): ParsedData {
    if (typeof input !== 'string') {
        throw new Error('入力は文字列である必要があります');
    }
    if (input.length === 0) {
        throw new Error('入力が空です');
    }
    // ...
}
```

### 6.2 XSS対策

#### MUST: React のデフォルト挙動を信頼
```typescript
// ✅ OK: Reactが自動的にエスケープ
<div>{userInput}</div>
```

#### MUST NOT: dangerouslySetInnerHTML は避ける
```typescript
// ❌ NG
<div dangerouslySetInnerHTML={{ __html: userInput }} />

// ✅ OK: どうしても必要な場合はサニタイズ
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userInput) }} />
```

**理由**: XSS攻撃の防止
**違反時の影響**: セキュリティ脆弱性

### 6.3 環境変数

#### MUST: 秘密情報はビルド時変数に含めない
```typescript
// ❌ NG: ビルド時に埋め込まれ、クライアント側で見える
const apiKey = process.env.NEXT_PUBLIC_API_KEY;

// ✅ OK: サーバーサイドでのみ使用
// pages/api/data.ts
const apiKey = process.env.SECRET_API_KEY;
```

---

## 7. ファイル・ディレクトリ構成ルール

### 7.1 サービス構成

#### MUST: src/app/api/health/ を実装 (ヘルスチェック)
```typescript
// src/app/api/health/route.ts
export async function GET() {
    return Response.json({
        status: 'ok',
        version: process.env.APP_VERSION || 'unknown',
    });
}
```

#### MUST: src/app/layout.tsx を実装
#### MUST: src/app/page.tsx を実装
#### MUST: src/lib/ を実装 (構成は自由)
#### MUST: tests/unit/ を実装
#### MUST: tests/e2e/ を実装
#### MUST: public/ を作成
#### SHOULD: src/components/ を作成 (推奨)
#### SHOULD: src/types/ を作成 (推奨)

### 7.2 ヘルスチェック API

#### MUST: 全サービスで app/api/health/route.ts を実装
#### MUST: status と version を返す
#### SHOULD: process.env.APP_VERSION を使用

---

## 8. 設定ファイルルール

### 8.1 基本方針

#### MUST: モノレポ全体で統一された設定を維持
#### MUST: 各サービスは共通設定を extends して利用
#### MAY: サービス固有の要件に応じて上書き可能
#### MUST: 共通設定で対応できない場合のみカスタマイズ
#### MUST: カスタマイズ理由をコメントで記載
```typescript
// jest.config.ts
const config = {
    ...baseConfig,
    // 特殊なモジュールのトランスフォーム設定が必要なため
    transformIgnorePatterns: [
        'node_modules/(?!(some-esm-module)/)',
    ],
};
```

### 8.2 Package Management

#### MUST: 共通パッケージはルートの package.json で管理

モノレポ全体で使用するパッケージはルートの `package.json` の `devDependencies` に定義する。

```json
// ✅ OK: ルートの package.json
{
    "devDependencies": {
        "typescript": "^5",
        "eslint": "^9",
        "prettier": "^3.7.4",
        "jest": "^30.2.0"
    }
}
```

#### MUST NOT: サービスやライブラリの package.json に共通パッケージを重複定義しない

```json
// ❌ NG: services/tools/package.json
{
    "devDependencies": {
        "typescript": "^5",  // ルートで既に定義されている
        "eslint": "^9"        // 重複定義
    }
}
```

#### MAY: サービス固有のパッケージのみ個別に追加

```json
// ✅ OK: services/analytics/package.json
{
    "dependencies": {
        "chart.js": "^4.0.0",           // グラフ描画（analytics サービス固有）
        "react-chartjs-2": "^5.0.0"     // Chart.js の React ラッパー（analytics サービス固有）
    },
    "devDependencies": {
        "@types/chart.js": "^2.0.0"     // Chart.js の型定義（analytics サービス固有）
    }
}
```

**サービス固有パッケージの例**:
- 外部API SDK (Stripe, AWS SDK の特定サービス等)
- データビジュアライゼーションライブラリ (Chart.js, D3.js 等)
- 特殊な機能ライブラリ (PDF生成、画像処理等)

**理由**:
- 依存関係の一元管理
- バージョン不整合の防止
- node_modules の重複を回避

**違反時の影響**:
- パッケージバージョンの不整合
- ビルドエラー
- 不必要なディスク使用量の増加

### 8.3 必須設定ファイル

#### MUST: package.json に標準スクリプトを定義
```json
{
    "scripts": {
        "dev": "next dev",
        "build": "next build --webpack",
        "lint": "eslint",
        "format": "prettier --write .",
        "format:check": "prettier --check .",
        "test": "jest",
        "test:watch": "jest --watch",
        "test:coverage": "jest --coverage",
        "test:e2e": "playwright test",
        "test:e2e:ui": "playwright test --ui"
    }
}
```

#### MUST: tsconfig.json で共通設定を継承
#### MUST: next.config.ts を作成
#### MUST: jest.config.ts を作成
#### MUST: playwright.config.ts を作成
#### MUST: eslint.config.mjs を作成

### 8.4 ESLint

#### MUST: configs/eslint.config.base.mjs を継承

```javascript
// services/*/eslint.config.mjs または libs/*/eslint.config.mjs
import baseConfig from '../../configs/eslint.config.base.mjs';

export default baseConfig;
```

#### MAY: サービス固有の要件がある場合のみ追加設定

```javascript
// services/tools/eslint.config.mjs (Next.js の場合)
import baseConfig from '../../configs/eslint.config.base.mjs';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default [
    ...baseConfig,
    ...nextVitals,
    ...nextTs,
    // 必要に応じて ignores などをカスタマイズ
];
```

### 8.5 Prettier

#### MUST: ルートの .prettierrc を使用

モノレポ全体で統一された Prettier 設定を使用し、各サービス・ライブラリでの上書きは行わない。

#### MUST NOT: サービスやライブラリごとに .prettierrc を作成しない

設定はルートの `.prettierrc` で一元管理される。

### 8.6 Jest

#### MUST: 各サービス・ライブラリで独自に jest.config.ts を管理
#### SHOULD: modulePathIgnorePatterns: ['<rootDir>/../../package.json'] を含める
#### SHOULD: カバレッジディレクトリを coverage に設定
#### SHOULD: collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'] を設定

### 8.7 Playwright

#### MUST: 各サービスで独自に playwright.config.ts を管理
#### SHOULD: CI 最適化設定 (workers, retries) は統一
#### SHOULD: トレース・スクリーンショット設定は統一

---

## 9. 共通ライブラリルール

### 9.1 依存関係

#### MUST: ライブラリ間の依存を一方向に保つ (ui → browser → common)
```
libs/
├── ui/           # @nagiyu/ui → @nagiyu/browser
├── browser/      # @nagiyu/browser → @nagiyu/common
└── common/       # @nagiyu/common  (依存なし)
```

#### MUST NOT: 循環依存を禁止
```typescript
// ❌ NG
// @nagiyu/common が @nagiyu/browser に依存
// @nagiyu/browser が @nagiyu/common に依存
```

#### MUST: common は外部依存なし (Node.js 標準ライブラリのみ可)
```json
// libs/common/package.json
{
    "dependencies": {}  // 外部依存なし
}
```

### 9.2 パスエイリアス

#### MUST NOT: ライブラリ内部でパスエイリアス (@/*) を使用しない
(「1.3 サービス vs ライブラリ」を参照)

#### MUST: ライブラリ内部では相対パスのみ使用

### 9.3 TypeScript 設定

#### MUST: ライブラリの tsconfig.json で tests/ を型チェック対象に含める
```json
{
    "include": ["src/**/*", "tests/**/*"]
}
```

#### SHOULD: rootDir は指定しない
**理由**: TypeScript が自動的に共通の親ディレクトリを判断

#### MUST: package.json の exports で dist/src/index.js を指定
```json
{
    "exports": {
        ".": "./dist/src/index.js"
    }
}
```

### 9.4 設計

#### MUST: common は純粋関数として実装
#### MUST: common は高いテストカバレッジを維持
#### MUST: browser はエラーハンドリングを統一
#### MUST: browser は SSR 対応 (ブラウザ環境チェック)
```typescript
// ✅ OK
export function clipboard() {
    if (typeof window === 'undefined') {
        throw new Error('clipboard is only available in browser');
    }
    // ...
}
```

#### MUST: browser はテスト容易性 (モック化しやすい設計)

### 9.5 バージョン管理

#### MUST: 各ライブラリで独立管理
#### MUST: セマンティックバージョニングに従う
#### MUST: 初期バージョンは 1.0.0 から開始
#### MUST: サービスのバージョン管理は独立 (1.0.0 から開始)

---

## 10. PWA ルール

### 10.1 基本方針

#### SHOULD: デフォルトで PWA 対応を推奨
#### MAY: サービスの性質に応じて無効化可能
#### MUST: ユーザー体験を優先

### 10.2 PWA 設定

#### MUST: PWA 対応時は app/offline/page.tsx を実装
#### MUST: PWA 対応時は public/manifest.json を作成
#### MUST: PWA 対応時は 192x192 と 512x512 のアイコンを作成
#### MUST: next-pwa で dest: 'public' を設定
#### MUST: next-pwa で disable: process.env.NODE_ENV === 'development' を設定
#### MUST: next-pwa で register: true を設定
#### MUST: next-pwa で skipWaiting: true を設定

### 10.3 PWA 無効化

#### SHOULD: 認証必須の管理画面では PWA を無効化
#### SHOULD: サーバーサイドレンダリングが重要な場合は PWA を無効化
#### SHOULD: リアルタイム性が必須な場合は PWA を無効化

### 10.4 テスト

#### SHOULD: E2E テストでオフライン時のフォールバック表示を確認
#### SHOULD: E2E テストで manifest.json の正しい読み込みを確認
#### SHOULD: E2E テストで Service Worker の登録を確認
#### SHOULD: Lighthouse で PWA スコアを確認

---

## 実装時チェックリスト

### 実装前チェック

- [ ] 関連ドキュメント (requirements.md, basic-design.md, detailed-design.md) を確認した
- [ ] 本ルールドキュメントを確認した
- [ ] アーキテクチャパターン (Parser/Formatter等) を選択した
- [ ] 依存関係 (ライブラリ間、ビルド順序) を確認した
- [ ] テスト戦略を決定した

### 実装中チェック

#### TypeScript
- [ ] strict mode が有効
- [ ] 型定義を types/ に配置 (サービスの場合)
- [ ] 型定義とデフォルト値をセット定義
- [ ] ライブラリ内部でパスエイリアス未使用 (ライブラリの場合)

#### アーキテクチャ
- [ ] UI層とビジネスロジックを分離
- [ ] エラーメッセージを定数化
- [ ] 純粋関数として実装 (該当する場合)

#### ブラウザAPI
- [ ] localStorage/Clipboard API は共通ラッパーを使用
- [ ] localStorage は useEffect 内でアクセス
- [ ] エラーハンドリングを実装

#### テスト
- [ ] ビジネスロジックのテストを作成
- [ ] AAA パターンを使用
- [ ] 一つのテストで一つの検証
- [ ] ブラウザAPI、外部APIをモック

#### セキュリティ
- [ ] 外部入力を検証
- [ ] dangerouslySetInnerHTML 未使用
- [ ] 秘密情報をビルド時変数に含めない

### 実装後チェック

#### ビルド・テスト
- [ ] ビルドが成功 (`npm run build`)
- [ ] 全テストがパス (`npm test`)
- [ ] カバレッジ 80% 以上 (`npm run test:coverage`)
- [ ] E2Eテストがパス (`npm run test:e2e`)
- [ ] Lint エラーなし (`npm run lint`)
- [ ] フォーマットチェック通過 (`npm run format:check`)

#### ドキュメント
- [ ] implementation.md を更新 (該当する場合)
- [ ] README.md を更新 (機能追加の場合)
- [ ] 型定義のコメントを追加 (公開APIの場合)

#### CI/CD
- [ ] ワークフロー設定を追加/更新 (新規サービス・ライブラリの場合)
- [ ] パスフィルターを設定
- [ ] ビルド順序を考慮 (依存関係がある場合)

---

## 参考ドキュメント

- [アーキテクチャ方針](./architecture.md)
- [共通設定ファイル](./configs.md)
- [テスト戦略](./testing.md)
- [共通ライブラリ設計](./shared-libraries.md)
- [サービステンプレート](./service-template.md)
- [PWA設定ガイド](./pwa.md)
- [ブランチ戦略](../branching.md)
