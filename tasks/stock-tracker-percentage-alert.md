# Stock Tracker アラート機能のリファクタリング - パーセンテージ選択機能の追加

## 概要

Stock Tracker のアラート機能に、所持している株価から自動的にアラート閾値を計算する機能を追加する。現在は手入力のみだが、保有株価に対する相対的な増減率（-20% ～ +20%、5%刻み）で選択できるようにし、ユーザビリティを向上させる。

## 関連情報

- **Issue**: [Refactor] Stock Tracker のアラートを所持金額から計算できるようにする
- **タスクタイプ**: サービスタスク（stock-tracker）
- **対象コンポーネント**: `services/stock-tracker/web/components/AlertSettingsModal.tsx`
- **関連ページ**: `services/stock-tracker/web/app/holdings/page.tsx`

## 要件

### 機能要件（FR）

#### FR1: パーセンテージ選択モードの追加

- 単一条件モードと範囲指定モードの両方において、「手動入力」と「パーセンテージ選択」の2つの入力方式を選択可能にする
- パーセンテージ選択時は、基準価格（保有株の平均取得価格）から自動的に目標価格を計算する
- `basePrice` prop が提供される場合のみパーセンテージ選択を利用可能にする（Buy/Sell モードは問わない）
- `basePrice` が `undefined` の場合（ウォッチリストからの利用時など）はパーセンテージ選択を無効化または非表示にする

#### FR2: パーセンテージ選択肢の実装

- 選択可能なパーセンテージ範囲: -20% ～ +20%
- 選択刻み: 5%
- 具体的な選択肢: -20%, -15%, -10%, -5%, 0%, +5%, +10%, +15%, +20%

#### FR3: 目標価格の自動計算

- パーセンテージ選択時、以下の計算式で目標価格を算出:
    - `目標価格 = 基準価格 × (1 + 選択パーセンテージ / 100)`
- 例: 基準価格が100円、+20%選択時 → 目標価格は120円

#### FR4: リアルタイム表示

- パーセンテージ選択時、計算された目標価格をリアルタイムでユーザーに表示する
- 表示例: 「基準価格: 100.00円 → 目標価格: 120.00円 (+20%)」

#### FR5: 既存機能の保持

- 手動入力モードは引き続き利用可能
- 範囲指定モード（range）は既存のまま維持
- 既存のバリデーションルール（0.01 ～ 1,000,000）を継承

### 非機能要件（NFR）

#### NFR1: 型安全性

- TypeScript strict mode で実装
- 新しいフォームフィールドに適切な型定義を追加

#### NFR2: テストカバレッジ

- テストカバレッジ 80% 以上を維持
- パーセンテージ計算ロジックのユニットテスト必須
- E2Eテストで実際のUI操作をテスト（chromium-mobile）

#### NFR3: エラーハンドリング

- エラーメッセージは日本語で `ERROR_MESSAGES` オブジェクトに定数化
- 基準価格が未設定の場合の適切なエラー処理

#### NFR4: UI/UX

- 既存のMaterial-UIデザインシステムに準拠
- レスポンシブデザイン（モバイルファーストの原則）
- アクセシビリティを考慮したフォーム設計

#### NFR5: 後方互換性

- 既存のアラート設定データに影響を与えない
- APIリクエストの構造は変更しない（内部計算のみ）

## 実装のヒント

### UI設計の方針

1. **入力方式選択**: 単一条件モードと範囲指定モードの両方に「入力方式」ドロップダウンを追加
    - 選択肢: 「手動入力」「パーセンテージ」
    - デフォルトは「手動入力」（既存の動作を保持）
    - 注意: Buy/Sell モードに関わらず、両方のモードでパーセンテージ選択を利用可能にする
    - 範囲指定モードでは、最小価格（下限）と最大価格（上限）の両方にパーセンテージ選択を適用

2. **パーセンテージ選択**: Material-UI の `Select` コンポーネントを使用
    - 9つの選択肢を `MenuItem` で実装
    - 選択肢のラベルには `%` を含める（例: 「+20%」「-10%」）

3. **目標価格表示**: `TextField` の `helperText` または独立した `Typography` で表示
    - 計算結果と計算式を分かりやすく提示
    - 例: 「100.00円 × 1.20 = 120.00円」

### フォームデータの拡張

現在の `FormData` インターフェースに以下を追加:

```typescript
interface FormData {
    // 既存のフィールド
    conditionMode: 'single' | 'range';
    operator: 'gte' | 'lte';
    targetPrice: string;
    minPrice: string;
    maxPrice: string;
    // ...

    // 追加するフィールド
    inputMode?: 'manual' | 'percentage'; // 入力方式（単一条件用）
    percentage?: string; // 選択されたパーセンテージ（単一条件用、-20 ～ +20）
    
    // 範囲指定モード用の追加フィールド
    rangeInputMode?: 'manual' | 'percentage'; // 範囲指定の入力方式
    minPercentage?: string; // 最小価格のパーセンテージ（-20 ～ +20）
    maxPercentage?: string; // 最大価格のパーセンテージ（-20 ～ +20）
}
```

### 計算ロジックの実装

パーセンテージから目標価格を計算するユーティリティ関数を作成:

```typescript
// 概念例（実際のコードではない）
function calculateTargetPriceFromPercentage(
    basePrice: number,
    percentage: number
): number {
    // basePrice × (1 + percentage / 100)
    // 結果は小数点第2位まで
}
```

### バリデーション追加

- `inputMode` が `'percentage'` の場合、`percentage` フィールドが必須
- `basePrice`（基準価格）が未設定（`undefined`）または 0 以下の場合:
    - パーセンテージ選択モードを無効化または非表示にする
    - 適切なエラーメッセージまたは説明を表示する
- 計算結果が有効な価格範囲（0.01 ～ 1,000,000）内であることを確認

### テスト方針

#### ユニットテスト

- パーセンテージ計算関数のテスト
    - 正常系: 各パーセンテージでの正確な計算結果
    - 異常系: 不正な基準価格、範囲外のパーセンテージ
- バリデーション関数のテスト
- フォーム状態管理のテスト

#### E2Eテスト

- 保有株一覧ページからアラート設定を開く
- 入力方式で「パーセンテージ」を選択
- 各パーセンテージを選択し、目標価格が正しく計算されることを確認
- アラート作成が成功することを確認

## タスク

### Phase 1: 準備と調査

- [x] 既存のアラート設定機能の仕様を確認
- [x] `AlertSettingsModal.tsx` のコード構造を理解
- [x] `holdings/page.tsx` から渡される `defaultTargetPrice` の仕組みを確認
- [x] テスト環境のセットアップ確認

#### 調査結果

##### 1. AlertSettingsModal.tsx のコード構造

**ファイル**: `services/stock-tracker/web/components/AlertSettingsModal.tsx`

**Props定義** (34-44行):
```typescript
interface AlertSettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  tickerId: string;
  symbol: string;
  exchangeId: string;
  mode: 'Buy' | 'Sell';
  defaultTargetPrice?: number;
}
```

**FormData型定義** (47-55行):
```typescript
interface FormData {
  conditionMode: 'single' | 'range';
  operator: 'gte' | 'lte'; // 単一条件の場合のみ
  targetPrice: string; // 単一条件の場合のみ
  rangeType: 'inside' | 'outside'; // 範囲指定の場合のみ
  minPrice: string; // 範囲指定の場合のみ
  maxPrice: string; // 範囲指定の場合のみ
  frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL';
}
```

**主要な状態管理**:
- `formData`: フォームの入力データ (94行)
- `formErrors`: バリデーションエラー (95行)
- `submitting`: 送信中フラグ (98行)
- `error`: エラーメッセージ (99行)
- `subscription`: Web Push サブスクリプション (100行)

**初期化ロジック** (103-113行):
- モーダルが開いた時に `getInitialFormData()` でフォームをリセット
- `defaultTargetPrice` が提供されている場合、`targetPrice` フィールドに設定
- エラーとサブスクリプションをクリア

**バリデーション関数** `validateForm()` (189-243行):
- 単一条件モード: `targetPrice` が0.01～1,000,000の範囲内か検証
- 範囲指定モード: `minPrice` と `maxPrice` が有効範囲内か、かつ `minPrice < maxPrice` か検証
- エラーメッセージは `ERROR_MESSAGES` 定数から取得

**UI構造**:
1. **条件タイプ選択** (395-408行): 単一条件 or 範囲指定
2. **単一条件モード** (410-449行):
    - 条件選択 (以上/以下)
    - 目標価格入力 (TextField)
    - helperText に `defaultTargetPrice` から計算された推奨値を表示 (442-444行)
3. **範囲指定モード** (451-503行):
    - 範囲タイプ選択 (範囲内AND / 範囲外OR)
    - 最小価格・最大価格入力 (TextField)
4. **通知頻度選択** (505-523行)

**現在の `defaultTargetPrice` の利用方法** (442-444行):
```typescript
helperText={
  formErrors.targetPrice ||
  (defaultTargetPrice && defaultTargetPrice > 0
    ? `推奨値: ${defaultTargetPrice.toFixed(2)} (平均取得価格 × 1.2)`
    : '')
}
```

##### 2. holdings/page.tsx からの defaultTargetPrice の渡し方

**ファイル**: `services/stock-tracker/web/app/holdings/page.tsx`

**AlertSettingsModal の呼び出し** (916-925行):
```typescript
<AlertSettingsModal
  open={alertModalOpen}
  onClose={handleCloseAlertModal}
  onSuccess={handleAlertSuccess}
  tickerId={selectedHolding.tickerId}
  symbol={selectedHolding.symbol}
  exchangeId={selectedHolding.tickerId.split(':')[0] || ''}
  mode="Sell"
  defaultTargetPrice={selectedHolding.averagePrice * 1.2}
/>
```

**重要な発見**:
- `defaultTargetPrice` は保有株の平均取得価格（`averagePrice`）に1.2を掛けた値
- これは**Sellアラート**（売りアラート）専用の推奨値として提供
- ウォッチリストからのBuyアラートには `defaultTargetPrice` が渡されない（undefined）

##### 3. ウォッチリストからのアラート設定

**ファイル**: `services/stock-tracker/web/app/watchlist/page.tsx`

**AlertSettingsModal の呼び出し** (515-524行):
```typescript
<AlertSettingsModal
  open={alertModalOpen}
  onClose={handleCloseAlertModal}
  onSuccess={handleAlertSuccess}
  tickerId={selectedWatchlistItem.tickerId}
  symbol={selectedWatchlistItem.symbol}
  exchangeId={selectedWatchlistItem.tickerId.split(':')[0] || ''}
  mode="Buy"
/>
```

- `defaultTargetPrice` prop は渡されない（undefined）
- これは**Buyアラート**（買いアラート）専用

##### 4. テスト環境の確認

**ユニットテスト (Jest)**:
- 設定ファイル: `jest.config.js` (存在確認済み)
- テストコマンド: `npm test`
- カバレッジ: `npm run test:coverage`
- 現在のテストファイル:
    - `tests/unit/lib/repository-factory.test.ts`
    - `tests/unit/helpers/cleanup.test.ts`

**E2Eテスト (Playwright)**:
- 設定ファイル: `playwright.config.ts`
- テストコマンド: `npm run test:e2e`
- デバイス: chromium-mobile (Fast CI)
- 関連テストファイル:
    - `tests/e2e/alert-management.spec.ts` (アラート設定フロー全般)
    - `tests/e2e/holding-management.spec.ts` (保有株管理)
    - `tests/e2e/watchlist-management.spec.ts` (ウォッチリスト管理)

**テスト環境の動作確認**:
- ✅ 依存関係のインストール完了 (`npm install`)
- ✅ Jest のテストリスト取得成功 (`npm test -- --listTests`)
- ✅ Playwright のテストリスト取得成功 (`npx playwright test --list`)
- ✅ 既存のアラート設定E2Eテストが存在（単一条件、範囲指定、バリデーション等）

##### 5. Phase 2以降の実装に向けた重要事項

**Props拡張の方針**:
- 新しく `basePrice?: number` prop を追加（パーセンテージ計算の基準価格）
- `defaultTargetPrice` は残すが、helperTextでの推奨値表示は削除
- `holdings/page.tsx`: `basePrice={selectedHolding.averagePrice}` を渡す
- `watchlist/page.tsx`: `basePrice` を渡さない（undefined のまま）

**FormData拡張の方針**:
- 単一条件モード用: `inputMode?: 'manual' | 'percentage'`, `percentage?: string`
- 範囲指定モード用: `rangeInputMode?: 'manual' | 'percentage'`, `minPercentage?: string`, `maxPercentage?: string`

**UI実装の方針**:
- 既存の helperText による推奨値表示を削除
- 各モードに「入力方式」選択ドロップダウンを追加
- パーセンテージ選択時、計算結果をリアルタイムで表示

**バリデーション追加事項**:
- `basePrice` が undefined または 0以下の場合、パーセンテージモードを無効化
- パーセンテージ選択時、計算結果が 0.01～1,000,000 の範囲内か検証
- 範囲指定モードでパーセンテージ選択時、最小価格 < 最大価格の検証

**テスト追加事項**:
- パーセンテージ計算関数の単体テスト
- 単一条件・範囲指定両方のバリデーションテスト
- E2Eテストでパーセンテージ選択フローのテスト（alert-management.spec.ts に追加）

### Phase 2: フォームデータとインターフェースの拡張

- [ ] `AlertSettingsModal` の Props インターフェースに `basePrice?: number` を追加（パーセンテージ計算の基準価格）
- [ ] `holdings/page.tsx` を修正して `basePrice={selectedHolding.averagePrice}` を渡すように変更
- [ ] `watchlist/page.tsx` では `basePrice` を渡さない（undefined のまま、パーセンテージ選択を無効化するため）
- [ ] `FormData` インターフェースに `inputMode` と `percentage` を追加（単一条件モード用）
- [ ] `FormData` インターフェースに `rangeInputMode`、`minPercentage`、`maxPercentage` を追加（範囲指定モード用）
- [ ] パーセンテージ選択肢の定数配列を定義（-20 ～ +20、5%刻み）
- [ ] `getInitialFormData` 関数を更新して新しいフィールドのデフォルト値を設定
- [ ] 型定義の追加に伴うコンパイルエラーを解消

### Phase 3: 計算ロジックの実装

- [ ] パーセンテージから目標価格を計算するヘルパー関数を作成
- [ ] 計算結果のフォーマット処理を実装（小数点第2位まで）
- [ ] パーセンテージ選択時のフォームデータ変換ロジックを実装
    - パーセンテージ選択 → 価格計算 → `targetPrice`/`minPrice`/`maxPrice` に設定
    - API には計算後の価格値のみを送信（パーセンテージ情報は送信しない）
    - `inputMode` や `percentage` フィールドは UI 状態管理のみに使用
- [ ] ビジネスロジックの単体テストを作成（80%以上のカバレッジ）

### Phase 4: UI実装

- [ ] 既存の `defaultTargetPrice` 推奨値表示（helperText）を削除
- [ ] 単一条件モード内に「入力方式」選択ドロップダウンを追加
- [ ] 「手動入力」モード時は既存の `TextField` を表示
- [ ] 「パーセンテージ」モード時はパーセンテージ選択ドロップダウンを表示
- [ ] 選択されたパーセンテージから目標価格を計算し、リアルタイムで表示
- [ ] 表示形式を分かりやすく整える（基準価格、計算式、目標価格）
- [ ] 範囲指定モード内にも「入力方式」選択ドロップダウンを追加
- [ ] 範囲指定モードの「パーセンテージ」モード時は、最小価格と最大価格の両方にパーセンテージ選択を表示
- [ ] 範囲指定モードでパーセンテージ選択時、計算された価格範囲をリアルタイムで表示

### Phase 5: バリデーションとエラーハンドリング

- [ ] `validateForm` 関数を拡張してパーセンテージモードに対応（単一条件・範囲指定両方）
- [ ] 基準価格が未設定または不正な場合のエラーメッセージを追加
- [ ] 計算結果が価格範囲外の場合のバリデーション追加
- [ ] 範囲指定モードでパーセンテージ選択時、最小価格 < 最大価格であることを確認
- [ ] `ERROR_MESSAGES` にエラーメッセージを日本語で追加

### Phase 6: テスト実装

- [ ] ユニットテスト作成:
    - [ ] パーセンテージ計算関数のテスト
    - [ ] バリデーション関数のテスト（単一条件・範囲指定両方）
    - [ ] フォーム状態管理のテスト
- [ ] E2Eテスト作成:
    - [ ] 単一条件モードでのパーセンテージ選択フローのテスト
    - [ ] 範囲指定モードでのパーセンテージ選択フローのテスト
    - [ ] 目標価格計算の正確性テスト
    - [ ] アラート作成の成功テスト
- [ ] テストカバレッジが80%以上であることを確認

### Phase 7: 検証とデプロイ準備

- [ ] ローカル環境でのマニュアルテスト
- [ ] 既存のアラート設定機能が正常動作することを確認
- [ ] Lint/Prettierを実行してコードスタイルを統一
- [ ] ドキュメント更新（該当する場合）
- [ ] PR作成とレビュー依頼

## 受け入れ基準

以下の全てを満たすこと:

1. [ ] パーセンテージ選択モードが実装され、-20% ～ +20% の範囲を5%刻みで選択可能
2. [ ] 選択したパーセンテージから目標価格が正確に計算される
3. [ ] 計算結果がUI上にリアルタイムで分かりやすく表示される
4. [ ] `basePrice` が提供される場合（保有株から）、パーセンテージ選択が正常に動作する（Buy/Sell モード問わず）
5. [ ] 単一条件モードでパーセンテージ選択が正常に動作する
6. [ ] 範囲指定モードでパーセンテージ選択が正常に動作する（最小価格・最大価格の両方）
7. [ ] 既存の手動入力モードが引き続き正常に動作する（単一条件・範囲指定両方）
8. [ ] `basePrice` が `undefined` の場合（ウォッチリストから）、パーセンテージ選択が適切に無効化または非表示になる
9. [ ] テストカバレッジが80%以上
10. [ ] E2Eテストが全てのデバイス（chromium-mobile含む）でパス
11. [ ] TypeScript strict mode でコンパイルエラーなし
12. [ ] ESLintとPrettierのチェックがパス
13. [ ] エラーメッセージが日本語で `ERROR_MESSAGES` に定数化されている
14. [ ] パーセンテージ選択時、計算された価格値が API に正しく送信される（既存の API 仕様のまま）

## 参考ドキュメント

- [コーディング規約](../../docs/development/rules.md) - TypeScript strict mode、エラーメッセージの日本語化等
- [アーキテクチャ方針](../../docs/development/architecture.md) - UI層とビジネスロジックの分離
- [テスト戦略](../../docs/development/testing.md) - テストカバレッジ要件、E2Eテスト方針
- [Stock Tracker アーキテクチャ](../../docs/services/stock-tracker/architecture.md) - サービス固有の設計方針
- [Stock Tracker 要件定義](../../docs/services/stock-tracker/requirements.md) - サービスの全体要件

## 備考・未決定事項

### 考慮事項（決定済み）

- **基準価格の扱い**: 新しく `basePrice?: number` prop を追加し、`holdings/page.tsx` から `averagePrice` を直接渡す
    - `defaultTargetPrice` の推奨値表示（「推奨値: XX円 (平均取得価格 × 1.2)」）は削除する
    - パーセンテージ選択機能により、ユーザーが自分で目標価格を設定しやすくなるため

- **パーセンテージ選択の利用条件**: `basePrice` の有無のみで判断する（Buy/Sell モードは問わない）
    - `basePrice` が提供される場合（現状: 保有株ページから Sell アラート作成時）→ パーセンテージ選択を利用可能
    - `basePrice` が `undefined` の場合（現状: ウォッチリストページから Buy アラート作成時）→ パーセンテージ選択を無効化または非表示
    - 将来的に保有株から Buy アラートを作成できるようになった場合も、この仕組みで対応可能
    - UIでは「パーセンテージ選択は基準価格が必要です」などの説明を表示する

- **デフォルト動作**: 既存ユーザーへの影響を最小化するため、デフォルトは「手動入力」モードとする

- **範囲指定モードでのパーセンテージ選択**: 範囲指定モード（range）においても、最小価格と最大価格の両方にパーセンテージ選択を適用可能にする
    - 例: 基準価格100円、最小価格-10%、最大価格+10% → 範囲 90円～110円
    - 範囲内（inside）/範囲外（outside）の両方のタイプで利用可能

### 今後の拡張候補

- カスタムパーセンテージの入力（-20% ～ +20%外の値）
- パーセンテージのプリセット保存機能
- 複数のパーセンテージアラートの一括設定

### 技術的な注意点

- パーセンテージ計算には新しく追加する `basePrice` prop を使用する（`defaultTargetPrice` は使わない）
- `defaultTargetPrice` prop 自体は削除せず残す（後方互換性のため）が、UI上の推奨値表示は削除する
- 小数点の丸め処理に注意（一貫性のある丸め方法を使用）
- **ウォッチリストからの利用時**: `basePrice` が `undefined` または未設定の場合の条件分岐を実装し、パーセンテージ選択UIを適切に制御する必要がある
