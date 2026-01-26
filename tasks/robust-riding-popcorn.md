# Stock Tracker アラート機能 - 価格範囲設定（上限・下限両方）実装計画

## 概要

Stock Trackerのアラート設定で、現在は「以上」または「以下」の単一条件のみ設定可能ですが、これを**「以上かつ以下」の両方を同時に設定**できるように拡張します。

例: 「100ドル以上、かつ200ドル以下の時に通知」

## 実装アプローチ

**汎用的な複数条件アプローチ（AND/OR評価）** を採用

### 選定理由
- データモデル `ConditionList: AlertCondition[]` は既に配列として設計済み
- Phase 2での複数条件実装が計画されていた
- 範囲内（AND）と範囲外（OR）の両方のユースケースをサポート
- 将来の拡張性（他フィールド対応、複雑な条件など）を考慮
- 既存アーキテクチャとの整合性が高い

### ユースケース
- **範囲内アラート（AND）**: 100〜110ドルの目標価格帯に到達したら売る（利確）
- **範囲外アラート（OR）**: 90ドル以下（損切り）または120ドル以上（大きな利益確定）で売る

## 設計詳細

### データモデル変更

Alert型に新しいフィールドを追加:
```typescript
type Alert = {
  // ... 既存フィールド
  LogicalOperator?: 'AND' | 'OR'; // 2条件の場合のみ使用。デフォルトは 'AND'
}
```

- **'AND'（範囲内）**: すべての条件を満たす必要がある
- **'OR'（範囲外）**: いずれかの条件を満たせば発火

### バリデーションルール

現在: `ConditionList.length === 1` のみ許可

新規:
- `ConditionList.length` は **1 または 2** を許可
- 2条件の場合の追加ルール:
  - 両方とも `field: 'price'` であること
  - 一方が `gte`（以上）、もう一方が `lte`（以下）であること
  - 同じ operator の重複は不可
  - **範囲の妥当性**:
    - **AND（範囲内）**: `gte.value < lte.value`（下限 < 上限）
    - **OR（範囲外）**: `lte.value < gte.value`（逆順）

### 評価ロジック

現在:
```typescript
// Phase 1: 最初の条件のみ評価
return evaluateCondition(alert.ConditionList[0], currentPrice);
```

新規:
```typescript
// 単一条件の場合
if (alert.ConditionList.length === 1) {
  return evaluateCondition(alert.ConditionList[0], currentPrice);
}

// 複数条件の場合
const logicalOp = alert.LogicalOperator || 'AND';
if (logicalOp === 'AND') {
  // 範囲内: すべての条件を満たす必要がある
  return alert.ConditionList.every(condition =>
    evaluateCondition(condition, currentPrice)
  );
} else {
  // 範囲外: いずれかの条件を満たせば発火
  return alert.ConditionList.some(condition =>
    evaluateCondition(condition, currentPrice)
  );
}
```

### UI設計

範囲指定UI（3つのモード）:
- **条件タイプ選択**: 単一条件 / 範囲指定
- **単一条件モード**: 従来通り（operator + targetPrice）
- **範囲指定モード**:
  - **範囲タイプ選択**: 範囲内 / 範囲外
  - **範囲内（AND）**:
    - 最小価格（下限）入力: この価格以上
    - 最大価格（上限）入力: この価格以下
    - 説明: 「価格が100〜200ドルの範囲内になったら通知」
  - **範囲外（OR）**:
    - 下限価格入力: この価格以下で通知
    - 上限価格入力: この価格以上で通知
    - 説明: 「価格が90ドル以下、または120ドル以上になったら通知」
  - 内部的には2つの `AlertCondition` + `LogicalOperator` として保存

### 通知メッセージ

- **単一条件**: "現在価格 $150.00 が目標価格 $100.00 以上になりました"
- **範囲内（AND）**: "現在価格 $105.00 が範囲 $100.00〜$110.00 内になりました"
- **範囲外（OR）**: "現在価格 $85.00 が範囲外（$90.00 以下 または $120.00 以上）になりました"

## 修正ファイル一覧

### コアロジック（優先度：高）

0. **services/stock-tracker/core/src/types.ts**
   - `Alert` 型に `LogicalOperator?: 'AND' | 'OR'` フィールドを追加

1. **services/stock-tracker/core/src/validation/index.ts** (L380-496)
   - `validateAlert()` 関数を修正
   - 2条件のバリデーション追加
   - `LogicalOperator` のバリデーション（単一条件の場合は未定義、2条件の場合は 'AND' または 'OR'）
   - 範囲の妥当性チェック:
     - AND（範囲内）: gte.value < lte.value
     - OR（範囲外）: lte.value < gte.value
   - 新しいエラーメッセージ定数追加:
     - `ALERT_CONDITION_RANGE_INVALID_AND`
     - `ALERT_CONDITION_RANGE_INVALID_OR`
     - `ALERT_CONDITION_OPERATORS_DUPLICATE`
     - `ALERT_CONDITION_OPERATORS_INVALID_COMBINATION`
     - `ALERT_LOGICAL_OPERATOR_INVALID`

2. **services/stock-tracker/core/src/services/alert-evaluator.ts** (L97-107)
   - `evaluateAlert()` 関数を修正
   - 単一条件/複数条件の分岐
   - AND評価（every()）とOR評価（some()）の実装
   - 後方互換性の維持（1条件でも動作）

### バッチ処理（優先度：高）

3. **services/stock-tracker/batch/src/minute.ts** (L115-144)
   - L121: ログ用の `alert.ConditionList[0]` 参照を修正
   - L129: `createAlertNotificationPayload()` 呼び出しを修正

4. **services/stock-tracker/batch/src/hourly.ts**
   - minute.ts と同様の修正

5. **services/stock-tracker/batch/src/lib/web-push-client.ts** (L121-141)
   - `createAlertNotificationPayload()` 関数のシグネチャ変更
   - 単一条件/範囲内（AND）/範囲外（OR）に応じたメッセージ生成
   - LogicalOperator を考慮したメッセージフォーマット

### フロントエンド（優先度：中）

6. **services/stock-tracker/web/components/AlertSettingsModal.tsx**
   - `FormData` 型を拡張:
     - conditionMode: 'single' | 'range'
     - rangeType: 'inside' | 'outside' (範囲指定の場合のみ)
     - minPrice, maxPrice (範囲指定の場合のみ)
   - 条件タイプ選択UI追加
   - 範囲指定モードのフォーム実装:
     - 範囲タイプ選択（範囲内/範囲外）
     - 価格入力フィールド（ラベルは範囲タイプで変わる）
   - バリデーションロジック追加:
     - 範囲内: minPrice < maxPrice
     - 範囲外: minPrice > maxPrice
   - API送信時の条件配列 + LogicalOperator 構築

### テスト（優先度：中）

7. **services/stock-tracker/core/tests/unit/services/alert-evaluator.test.ts**
   - 複数条件AND評価のテスト追加
   - 境界値テスト（下限ちょうど、上限ちょうど）
   - 範囲外のテスト

8. **services/stock-tracker/core/tests/unit/validation/index.test.ts**
   - 2条件バリデーションテスト
   - 範囲妥当性チェックテスト
   - エラーケーステスト

9. **services/stock-tracker/web/tests/e2e/alert-management.spec.ts**
   - 範囲指定UIのE2Eテスト
   - アラート作成・更新フロー

10. **services/stock-tracker/batch/tests/unit/minute.test.ts**
    - 複数条件評価のテスト

11. **services/stock-tracker/batch/tests/unit/hourly.test.ts**
    - 複数条件評価のテスト

### APIエンドポイント（変更不要、確認のみ）

12. **services/stock-tracker/web/app/api/alerts/route.ts**
    - バリデーションに依存しているため、基本的に変更不要
    - エラーハンドリングの確認のみ

13. **services/stock-tracker/web/app/api/alerts/[id]/route.ts**
    - 同上

## 実装手順

### Step 1: データモデル拡張
1. types.ts の `Alert` 型を修正
   - `LogicalOperator?: 'AND' | 'OR'` フィールドを追加

### Step 2: バックエンド - バリデーション拡張
1. validation/index.ts の `validateAlert()` を修正
   - L445-446: 2条件を許可するように変更
   - LogicalOperator のバリデーション実装
   - 2条件の場合の追加バリデーションロジック実装（AND/OR別の範囲チェック）
2. 新しいエラーメッセージ定数を追加
3. ユニットテスト追加

### Step 3: バックエンド - 評価ロジック拡張
1. alert-evaluator.ts の `evaluateAlert()` を修正
   - L103-106: AND（every()）とOR（some()）の実装に変更
2. ユニットテスト追加（AND/OR両方のケース）

### Step 4: バックエンド - バッチ処理対応
1. minute.ts と hourly.ts を修正
   - 複数条件に対応したログ出力
   - 通知ペイロード生成の修正
2. web-push-client.ts の `createAlertNotificationPayload()` を修正
   - 関数シグネチャ変更（condition 引数の代わりに alert 全体から判断）
   - 1条件/範囲内（AND）/範囲外（OR）に応じたメッセージ生成
3. バッチ処理のユニットテスト追加

### Step 5: フロントエンド - UI実装
1. AlertSettingsModal.tsx を修正
   - フォームデータ型拡張（conditionMode, rangeType, minPrice, maxPrice）
   - 条件タイプ選択UI追加
   - 範囲タイプ選択UI追加（範囲内/範囲外）
   - 範囲指定モードのフォーム実装
   - バリデーション追加（AND/OR別の範囲チェック）
   - API送信時の LogicalOperator 設定
2. E2Eテスト追加（範囲内/範囲外両方）

### Step 6: 統合テスト・検証
1. すべてのユニットテスト・E2Eテストが通ることを確認
2. 手動テストで動作確認:
   - 範囲内アラート（100〜110ドル）の発火確認
   - 範囲外アラート（90ドル以下または120ドル以上）の発火確認
3. **重要**: 既存の単一条件アラートが引き続き動作することを確認

## リスクと対策

### リスク 1: 既存アラートへの影響
**リスク**: 既存の単一条件アラートが動作しなくなる

**対策**:
- 後方互換性を最優先
- `ConditionList.length === 1` の動作を保証
- 既存テストをすべて維持してパスすることを確認

### リスク 2: バッチ処理のパフォーマンス
**リスク**: 複数条件評価による処理時間増加

**対策**:
- 評価ロジックは単純な比較なので影響は最小限
- 条件数は最大2つなので実質的な影響はほぼない

### リスク 3: UIの複雑化
**リスク**: ユーザーが範囲指定を理解しにくい

**対策**:
- シンプルで直感的な「最小価格・最大価格」UI
- ヘルプテキストで明確な説明
- わかりやすいバリデーションエラーメッセージ

### リスク 4: Web Push通知の内容
**リスク**: 複数条件の通知メッセージが不明瞭

**対策**:
- 明確なメッセージフォーマット定義
- 単一条件と範囲指定で異なる表現

## 検証方法

### ユニットテスト
- **alert-evaluator**:
  - 複数条件AND評価（範囲内）
  - 複数条件OR評価（範囲外）
  - 境界値テスト
  - 後方互換性（単一条件）
- **validation**:
  - 2条件バリデーション
  - LogicalOperator のバリデーション
  - 範囲チェック（AND: min < max, OR: min > max）
  - エラーケース
- **batch処理**:
  - 複数条件評価
  - 通知ペイロード生成（範囲内/範囲外）

### E2Eテスト
- 範囲内アラートの作成（100〜110ドル）
- 範囲外アラートの作成（90ドル以下または120ドル以上）
- アラート編集
- アラート発火時の通知確認

### 手動テスト
1. **既存アラート**: 既存の単一条件アラートが引き続き動作することを確認
2. **範囲内アラート**:
   - 100〜110ドルの範囲内アラートを作成
   - 価格が105ドルになった時に通知が届くことを確認
   - 価格が95ドルや115ドルの時に通知が届かないことを確認
3. **範囲外アラート**:
   - 90ドル以下または120ドル以上の範囲外アラートを作成
   - 価格が85ドルになった時に通知が届くことを確認
   - 価格が125ドルになった時に通知が届くことを確認
   - 価格が100ドル（範囲内）の時に通知が届かないことを確認

## 実装の詳細例

### バリデーション実装
```typescript
// validation/index.ts の validateAlert() 内
if (alt.ConditionList.length > 2) {
  errors.push('アラート条件は最大2つまでです');
} else if (alt.ConditionList.length === 2) {
  const [cond1, cond2] = alt.ConditionList;

  // LogicalOperator のチェック
  if (!alt.LogicalOperator) {
    errors.push('2条件の場合は LogicalOperator が必須です');
  } else if (alt.LogicalOperator !== 'AND' && alt.LogicalOperator !== 'OR') {
    errors.push(ERROR_MESSAGES.ALERT_LOGICAL_OPERATOR_INVALID);
  }

  // 両方とも price フィールド
  if (cond1.field !== 'price' || cond2.field !== 'price') {
    errors.push(ERROR_MESSAGES.ALERT_CONDITION_FIELD_INVALID);
  }

  // operator の組み合わせチェック
  const operators = [cond1.operator, cond2.operator].sort();
  if (operators[0] === operators[1]) {
    errors.push('同じ演算子を複数指定することはできません');
  } else if (!(operators[0] === 'gte' && operators[1] === 'lte')) {
    errors.push('2つの条件を設定する場合は、一方を「以上」、もう一方を「以下」にしてください');
  }

  // 範囲の妥当性チェック（AND/OR別）
  const gteCondition = cond1.operator === 'gte' ? cond1 : cond2;
  const lteCondition = cond1.operator === 'lte' ? cond1 : cond2;

  if (alt.LogicalOperator === 'AND') {
    // 範囲内: 下限 < 上限
    if (gteCondition.value >= lteCondition.value) {
      errors.push('範囲内アラートの場合、下限価格は上限価格より小さい値を設定してください');
    }
  } else if (alt.LogicalOperator === 'OR') {
    // 範囲外: 下限 > 上限
    if (lteCondition.value >= gteCondition.value) {
      errors.push('範囲外アラートの場合、下限価格は上限価格より大きい値を設定してください');
    }
  }
} else if (alt.ConditionList.length === 1) {
  // 単一条件の場合、LogicalOperator は未定義であるべき
  if (alt.LogicalOperator !== undefined) {
    errors.push('単一条件の場合、LogicalOperator は設定できません');
  }
}
```

### 評価ロジック実装
```typescript
// alert-evaluator.ts
export function evaluateAlert(alert: Alert, currentPrice: number): boolean {
  if (!alert.ConditionList || alert.ConditionList.length === 0) {
    throw new Error(ERROR_MESSAGES.EMPTY_CONDITION_LIST);
  }

  // 単一条件の場合
  if (alert.ConditionList.length === 1) {
    return evaluateCondition(alert.ConditionList[0], currentPrice);
  }

  // 複数条件の場合
  const logicalOp = alert.LogicalOperator || 'AND';

  if (logicalOp === 'AND') {
    // 範囲内: すべての条件を満たす必要がある
    return alert.ConditionList.every(condition =>
      evaluateCondition(condition, currentPrice)
    );
  } else if (logicalOp === 'OR') {
    // 範囲外: いずれかの条件を満たせば発火
    return alert.ConditionList.some(condition =>
      evaluateCondition(condition, currentPrice)
    );
  } else {
    throw new Error('無効な LogicalOperator です');
  }
}
```

### 通知ペイロード生成
```typescript
// web-push-client.ts
export function createAlertNotificationPayload(
  alert: Alert,
  currentPrice: number
): NotificationPayload {
  const mode = alert.Mode === 'Buy' ? '買い' : '売り';

  let body: string;
  if (alert.ConditionList.length === 2) {
    const gteCondition = alert.ConditionList.find(c => c.operator === 'gte');
    const lteCondition = alert.ConditionList.find(c => c.operator === 'lte');

    if (alert.LogicalOperator === 'AND') {
      // 範囲内アラート
      body = `現在価格 $${currentPrice.toFixed(2)} が範囲 $${gteCondition.value.toFixed(2)}〜$${lteCondition.value.toFixed(2)} 内になりました`;
    } else {
      // 範囲外アラート
      body = `現在価格 $${currentPrice.toFixed(2)} が範囲外（$${lteCondition.value.toFixed(2)} 以下 または $${gteCondition.value.toFixed(2)} 以上）になりました`;
    }
  } else {
    // 単一条件の場合（従来通り）
    const condition = alert.ConditionList[0];
    const operatorText = condition.operator === 'gte' ? '以上' : '以下';
    body = `現在価格 $${currentPrice.toFixed(2)} が目標価格 $${condition.value.toFixed(2)} ${operatorText}になりました`;
  }

  return {
    title: `${mode}アラート: ${alert.TickerID}`,
    body,
    icon: '/icon-192x192.png',
    data: {
      alertId: alert.AlertID,
      tickerId: alert.TickerID,
      mode: alert.Mode,
      currentPrice,
    },
  };
}
```

### UI実装例（AlertSettingsModal.tsx）
```typescript
// フォームデータ型
interface FormData {
  conditionMode: 'single' | 'range';
  operator: 'gte' | 'lte'; // 単一条件の場合のみ
  targetPrice: string; // 単一条件の場合のみ
  rangeType: 'inside' | 'outside'; // 範囲指定の場合のみ
  minPrice: string; // 範囲指定の場合のみ
  maxPrice: string; // 範囲指定の場合のみ
  frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL';
}

// 条件タイプ選択
<FormControl fullWidth>
  <InputLabel>条件タイプ</InputLabel>
  <Select
    value={formData.conditionMode}
    onChange={(e) => handleFormChange('conditionMode', e.target.value)}
  >
    <MenuItem value="single">単一条件（以上または以下）</MenuItem>
    <MenuItem value="range">範囲指定</MenuItem>
  </Select>
</FormControl>

{formData.conditionMode === 'range' && (
  <FormControl fullWidth>
    <InputLabel>範囲タイプ</InputLabel>
    <Select
      value={formData.rangeType}
      onChange={(e) => handleFormChange('rangeType', e.target.value)}
    >
      <MenuItem value="inside">範囲内（AND）</MenuItem>
      <MenuItem value="outside">範囲外（OR）</MenuItem>
    </Select>
    <FormHelperText>
      {formData.rangeType === 'inside'
        ? '価格が指定範囲内になったら通知'
        : '価格が指定範囲外になったら通知'}
    </FormHelperText>
  </FormControl>
)}

{formData.conditionMode === 'range' && (
  <>
    <TextField
      label={formData.rangeType === 'inside' ? '最小価格（下限）' : '下限価格'}
      value={formData.minPrice}
      helperText={
        formData.rangeType === 'inside'
          ? 'この価格以上'
          : 'この価格以下で通知'
      }
      {...}
    />
    <TextField
      label={formData.rangeType === 'inside' ? '最大価格（上限）' : '上限価格'}
      value={formData.maxPrice}
      helperText={
        formData.rangeType === 'inside'
          ? 'この価格以下'
          : 'この価格以上で通知'
      }
      {...}
    />
  </>
)}

// API送信時の条件配列構築
const buildConditions = (): { conditions: AlertCondition[]; logicalOperator?: 'AND' | 'OR' } => {
  if (formData.conditionMode === 'single') {
    return {
      conditions: [{
        field: 'price',
        operator: formData.operator,
        value: parseFloat(formData.targetPrice),
      }],
    };
  } else {
    const min = parseFloat(formData.minPrice);
    const max = parseFloat(formData.maxPrice);
    const logicalOperator = formData.rangeType === 'inside' ? 'AND' : 'OR';

    if (formData.rangeType === 'inside') {
      // 範囲内: min 以上、max 以下
      return {
        conditions: [
          { field: 'price', operator: 'gte', value: min },
          { field: 'price', operator: 'lte', value: max },
        ],
        logicalOperator,
      };
    } else {
      // 範囲外: min 以下、max 以上
      return {
        conditions: [
          { field: 'price', operator: 'lte', value: min },
          { field: 'price', operator: 'gte', value: max },
        ],
        logicalOperator,
      };
    }
  }
};
```

## クリティカルファイル

実装に最も重要なファイル（優先順）:

0. **services/stock-tracker/core/src/types.ts**
1. **services/stock-tracker/core/src/validation/index.ts** (L380-496)
2. **services/stock-tracker/core/src/services/alert-evaluator.ts** (L97-107)
3. **services/stock-tracker/web/components/AlertSettingsModal.tsx**
4. **services/stock-tracker/batch/src/lib/web-push-client.ts** (L121-141)
5. **services/stock-tracker/batch/src/minute.ts** (L115-144)
6. **services/stock-tracker/core/tests/unit/services/alert-evaluator.test.ts**
