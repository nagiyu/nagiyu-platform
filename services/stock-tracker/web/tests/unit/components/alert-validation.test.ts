/**
 * Alert Settings Validation Unit Tests
 *
 * AlertSettingsModal のバリデーションロジックを検証
 * パーセンテージ選択モード対応のバリデーションをテスト
 */

import { calculateTargetPriceFromPercentage } from '../../../lib/percentage-helper';

// エラーメッセージ定数（AlertSettingsModal.tsx から複製）
const ERROR_MESSAGES = {
  INVALID_TARGET_PRICE: '目標価格は0.01以上、1,000,000以下で入力してください',
  INVALID_MIN_PRICE: '最小価格は0.01以上、1,000,000以下で入力してください',
  INVALID_MAX_PRICE: '最大価格は0.01以上、1,000,000以下で入力してください',
  INVALID_RANGE_INSIDE: '範囲内アラートの場合、最小価格は最大価格より小さい値を設定してください',
  INVALID_RANGE_OUTSIDE: '範囲外アラートの場合、下限価格は上限価格より小さい値を設定してください',
  REQUIRED_FIELD: 'この項目は必須です',
  PERCENTAGE_REQUIRED: 'パーセンテージを選択してください',
  BASE_PRICE_REQUIRED: '基準価格が設定されていません。パーセンテージ選択を使用できません',
  INVALID_BASE_PRICE: '基準価格が不正です（0以下）。パーセンテージ選択を使用できません',
  CALCULATED_PRICE_OUT_OF_RANGE:
    '計算結果が有効な価格範囲（0.01～1,000,000）を超えています。別のパーセンテージを選択してください',
  CALCULATED_MIN_PRICE_OUT_OF_RANGE:
    '計算された最小価格が有効な範囲（0.01～1,000,000）を超えています。別のパーセンテージを選択してください',
  CALCULATED_MAX_PRICE_OUT_OF_RANGE:
    '計算された最大価格が有効な範囲（0.01～1,000,000）を超えています。別のパーセンテージを選択してください',
} as const;

// FormData型定義（AlertSettingsModal.tsx から複製）
interface FormData {
  conditionMode: 'single' | 'range';
  operator: 'gte' | 'lte';
  targetPrice: string;
  rangeType: 'inside' | 'outside';
  minPrice: string;
  maxPrice: string;
  frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL';
  inputMode?: 'manual' | 'percentage';
  percentage?: string;
  rangeInputMode?: 'manual' | 'percentage';
  minPercentage?: string;
  maxPercentage?: string;
}

// バリデーション関数（AlertSettingsModal.tsx から抽出）
function validateForm(
  formData: FormData,
  basePrice?: number
): { valid: boolean; errors: Partial<Record<keyof FormData, string>> } {
  const errors: Partial<Record<keyof FormData, string>> = {};

  if (formData.conditionMode === 'single') {
    // 単一条件のバリデーション
    if (formData.inputMode === 'percentage') {
      // パーセンテージモードの場合
      // 1. 基準価格のチェック
      if (basePrice === undefined || basePrice === null) {
        errors.percentage = ERROR_MESSAGES.BASE_PRICE_REQUIRED;
      } else if (basePrice <= 0) {
        errors.percentage = ERROR_MESSAGES.INVALID_BASE_PRICE;
      }
      // 基準価格が問題ない場合のみ、以降のチェックを行う
      else {
        // 2. パーセンテージフィールドの必須チェック
        if (!formData.percentage) {
          errors.percentage = ERROR_MESSAGES.PERCENTAGE_REQUIRED;
        }

        // 3. 計算結果の価格範囲チェック
        if (formData.targetPrice) {
          const targetPrice = parseFloat(formData.targetPrice);
          if (!isNaN(targetPrice) && (targetPrice < 0.01 || targetPrice > 1000000)) {
            errors.percentage = ERROR_MESSAGES.CALCULATED_PRICE_OUT_OF_RANGE;
          }
        }
      }
    } else {
      // 手動入力モードの場合（既存のバリデーション）
      if (!formData.targetPrice) {
        errors.targetPrice = ERROR_MESSAGES.REQUIRED_FIELD;
      } else {
        const targetPrice = parseFloat(formData.targetPrice);
        if (isNaN(targetPrice) || targetPrice < 0.01 || targetPrice > 1000000) {
          errors.targetPrice = ERROR_MESSAGES.INVALID_TARGET_PRICE;
        }
      }
    }
  } else {
    // 範囲指定のバリデーション
    if (formData.rangeInputMode === 'percentage') {
      // パーセンテージモードの場合
      // 1. 基準価格のチェック
      let basePriceError: string | undefined;
      if (basePrice === undefined || basePrice === null) {
        basePriceError = ERROR_MESSAGES.BASE_PRICE_REQUIRED;
      } else if (basePrice <= 0) {
        basePriceError = ERROR_MESSAGES.INVALID_BASE_PRICE;
      }

      if (basePriceError) {
        errors.minPercentage = basePriceError;
        errors.maxPercentage = basePriceError;
      }
      // 基準価格が問題ない場合のみ、以降のチェックを行う
      else {
        // 2. パーセンテージフィールドの必須チェック
        if (!formData.minPercentage) {
          errors.minPercentage = ERROR_MESSAGES.PERCENTAGE_REQUIRED;
        }
        if (!formData.maxPercentage) {
          errors.maxPercentage = ERROR_MESSAGES.PERCENTAGE_REQUIRED;
        }

        // 3. 計算結果の価格範囲チェック
        if (formData.minPrice) {
          const minPrice = parseFloat(formData.minPrice);
          if (!isNaN(minPrice) && (minPrice < 0.01 || minPrice > 1000000)) {
            errors.minPercentage = ERROR_MESSAGES.CALCULATED_MIN_PRICE_OUT_OF_RANGE;
          }
        }
        if (formData.maxPrice) {
          const maxPrice = parseFloat(formData.maxPrice);
          if (!isNaN(maxPrice) && (maxPrice < 0.01 || maxPrice > 1000000)) {
            errors.maxPercentage = ERROR_MESSAGES.CALCULATED_MAX_PRICE_OUT_OF_RANGE;
          }
        }

        // 4. 範囲の妥当性チェック（最小価格 < 最大価格）
        if (formData.minPrice && formData.maxPrice) {
          const minPrice = parseFloat(formData.minPrice);
          const maxPrice = parseFloat(formData.maxPrice);

          if (!isNaN(minPrice) && !isNaN(maxPrice)) {
            if (minPrice >= maxPrice) {
              errors.minPercentage =
                formData.rangeType === 'inside'
                  ? ERROR_MESSAGES.INVALID_RANGE_INSIDE
                  : ERROR_MESSAGES.INVALID_RANGE_OUTSIDE;
            }
          }
        }
      }
    } else {
      // 手動入力モードの場合（既存のバリデーション）
      if (!formData.minPrice) {
        errors.minPrice = ERROR_MESSAGES.REQUIRED_FIELD;
      } else {
        const minPrice = parseFloat(formData.minPrice);
        if (isNaN(minPrice) || minPrice < 0.01 || minPrice > 1000000) {
          errors.minPrice = ERROR_MESSAGES.INVALID_MIN_PRICE;
        }
      }

      if (!formData.maxPrice) {
        errors.maxPrice = ERROR_MESSAGES.REQUIRED_FIELD;
      } else {
        const maxPrice = parseFloat(formData.maxPrice);
        if (isNaN(maxPrice) || maxPrice < 0.01 || maxPrice > 1000000) {
          errors.maxPrice = ERROR_MESSAGES.INVALID_MAX_PRICE;
        }
      }

      // 範囲の妥当性チェック
      if (formData.minPrice && formData.maxPrice) {
        const minPrice = parseFloat(formData.minPrice);
        const maxPrice = parseFloat(formData.maxPrice);

        if (!isNaN(minPrice) && !isNaN(maxPrice)) {
          if (minPrice >= maxPrice) {
            errors.minPrice =
              formData.rangeType === 'inside'
                ? ERROR_MESSAGES.INVALID_RANGE_INSIDE
                : ERROR_MESSAGES.INVALID_RANGE_OUTSIDE;
          }
        }
      }
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

describe('AlertSettingsModal Validation', () => {
  describe('単一条件モード - 手動入力', () => {
    const baseFormData: FormData = {
      conditionMode: 'single',
      operator: 'gte',
      targetPrice: '',
      rangeType: 'inside',
      minPrice: '',
      maxPrice: '',
      frequency: 'MINUTE_LEVEL',
      inputMode: 'manual',
    };

    it('正常系: 有効な目標価格が入力されている場合、バリデーションが成功する', () => {
      const formData = { ...baseFormData, targetPrice: '100.00' };
      const result = validateForm(formData);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual({});
    });

    it('異常系: 目標価格が未入力の場合、エラーが返される', () => {
      const formData = { ...baseFormData, targetPrice: '' };
      const result = validateForm(formData);
      expect(result.valid).toBe(false);
      expect(result.errors.targetPrice).toBe(ERROR_MESSAGES.REQUIRED_FIELD);
    });

    it('異常系: 目標価格が0.01未満の場合、エラーが返される', () => {
      const formData = { ...baseFormData, targetPrice: '0.001' };
      const result = validateForm(formData);
      expect(result.valid).toBe(false);
      expect(result.errors.targetPrice).toBe(ERROR_MESSAGES.INVALID_TARGET_PRICE);
    });

    it('異常系: 目標価格が1,000,000を超える場合、エラーが返される', () => {
      const formData = { ...baseFormData, targetPrice: '1000001' };
      const result = validateForm(formData);
      expect(result.valid).toBe(false);
      expect(result.errors.targetPrice).toBe(ERROR_MESSAGES.INVALID_TARGET_PRICE);
    });

    it('境界値: 目標価格が0.01の場合、バリデーションが成功する', () => {
      const formData = { ...baseFormData, targetPrice: '0.01' };
      const result = validateForm(formData);
      expect(result.valid).toBe(true);
    });

    it('境界値: 目標価格が1,000,000の場合、バリデーションが成功する', () => {
      const formData = { ...baseFormData, targetPrice: '1000000' };
      const result = validateForm(formData);
      expect(result.valid).toBe(true);
    });
  });

  describe('単一条件モード - パーセンテージ選択', () => {
    const baseFormData: FormData = {
      conditionMode: 'single',
      operator: 'gte',
      targetPrice: '',
      rangeType: 'inside',
      minPrice: '',
      maxPrice: '',
      frequency: 'MINUTE_LEVEL',
      inputMode: 'percentage',
      percentage: '',
    };

    it('正常系: 基準価格とパーセンテージが設定され、計算結果が有効範囲内の場合、バリデーションが成功する', () => {
      const basePrice = 100;
      const percentage = 20;
      const calculatedPrice = calculateTargetPriceFromPercentage(basePrice, percentage);
      const formData = {
        ...baseFormData,
        percentage: percentage.toString(),
        targetPrice: calculatedPrice.toString(),
      };
      const result = validateForm(formData, basePrice);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual({});
    });

    it('異常系: 基準価格が未設定（undefined）の場合、エラーが返される', () => {
      const formData = {
        ...baseFormData,
        percentage: '20',
        targetPrice: '120',
      };
      const result = validateForm(formData, undefined);
      expect(result.valid).toBe(false);
      expect(result.errors.percentage).toBe(ERROR_MESSAGES.BASE_PRICE_REQUIRED);
    });

    it('異常系: 基準価格が0以下の場合、エラーが返される', () => {
      const formData = {
        ...baseFormData,
        percentage: '20',
        targetPrice: '0',
      };
      const result = validateForm(formData, 0);
      expect(result.valid).toBe(false);
      expect(result.errors.percentage).toBe(ERROR_MESSAGES.INVALID_BASE_PRICE);
    });

    it('異常系: 基準価格が負の値の場合、エラーが返される', () => {
      const formData = {
        ...baseFormData,
        percentage: '20',
        targetPrice: '-120',
      };
      const result = validateForm(formData, -100);
      expect(result.valid).toBe(false);
      expect(result.errors.percentage).toBe(ERROR_MESSAGES.INVALID_BASE_PRICE);
    });

    it('異常系: パーセンテージが未選択の場合、エラーが返される', () => {
      const formData = {
        ...baseFormData,
        percentage: '',
        targetPrice: '',
      };
      const result = validateForm(formData, 100);
      expect(result.valid).toBe(false);
      expect(result.errors.percentage).toBe(ERROR_MESSAGES.PERCENTAGE_REQUIRED);
    });

    it('異常系: 計算結果が0.01未満の場合、エラーが返される', () => {
      const formData = {
        ...baseFormData,
        percentage: '-100',
        targetPrice: '0.001', // 0.01未満
      };
      const result = validateForm(formData, 100);
      expect(result.valid).toBe(false);
      expect(result.errors.percentage).toBe(ERROR_MESSAGES.CALCULATED_PRICE_OUT_OF_RANGE);
    });

    it('異常系: 計算結果が1,000,000を超える場合、エラーが返される', () => {
      const formData = {
        ...baseFormData,
        percentage: '1000',
        targetPrice: '1100000', // 1,000,000超
      };
      const result = validateForm(formData, 100000);
      expect(result.valid).toBe(false);
      expect(result.errors.percentage).toBe(ERROR_MESSAGES.CALCULATED_PRICE_OUT_OF_RANGE);
    });

    it('境界値: 計算結果が0.01の場合、バリデーションが成功する', () => {
      const formData = {
        ...baseFormData,
        percentage: '0',
        targetPrice: '0.01',
      };
      const result = validateForm(formData, 0.01);
      expect(result.valid).toBe(true);
    });

    it('境界値: 計算結果が1,000,000の場合、バリデーションが成功する', () => {
      const formData = {
        ...baseFormData,
        percentage: '0',
        targetPrice: '1000000',
      };
      const result = validateForm(formData, 1000000);
      expect(result.valid).toBe(true);
    });
  });

  describe('範囲指定モード - 手動入力', () => {
    const baseFormData: FormData = {
      conditionMode: 'range',
      operator: 'gte',
      targetPrice: '',
      rangeType: 'inside',
      minPrice: '',
      maxPrice: '',
      frequency: 'MINUTE_LEVEL',
      rangeInputMode: 'manual',
    };

    it('正常系: 有効な最小・最大価格が入力されている場合、バリデーションが成功する', () => {
      const formData = { ...baseFormData, minPrice: '90.00', maxPrice: '110.00' };
      const result = validateForm(formData);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual({});
    });

    it('異常系: 最小価格が未入力の場合、エラーが返される', () => {
      const formData = { ...baseFormData, minPrice: '', maxPrice: '110.00' };
      const result = validateForm(formData);
      expect(result.valid).toBe(false);
      expect(result.errors.minPrice).toBe(ERROR_MESSAGES.REQUIRED_FIELD);
    });

    it('異常系: 最大価格が未入力の場合、エラーが返される', () => {
      const formData = { ...baseFormData, minPrice: '90.00', maxPrice: '' };
      const result = validateForm(formData);
      expect(result.valid).toBe(false);
      expect(result.errors.maxPrice).toBe(ERROR_MESSAGES.REQUIRED_FIELD);
    });

    it('異常系: 最小価格 >= 最大価格の場合（範囲内）、エラーが返される', () => {
      const formData = {
        ...baseFormData,
        minPrice: '110.00',
        maxPrice: '90.00',
        rangeType: 'inside',
      };
      const result = validateForm(formData);
      expect(result.valid).toBe(false);
      expect(result.errors.minPrice).toBe(ERROR_MESSAGES.INVALID_RANGE_INSIDE);
    });

    it('異常系: 最小価格 >= 最大価格の場合（範囲外）、エラーが返される', () => {
      const formData = {
        ...baseFormData,
        minPrice: '110.00',
        maxPrice: '90.00',
        rangeType: 'outside',
      };
      const result = validateForm(formData);
      expect(result.valid).toBe(false);
      expect(result.errors.minPrice).toBe(ERROR_MESSAGES.INVALID_RANGE_OUTSIDE);
    });
  });

  describe('範囲指定モード - パーセンテージ選択', () => {
    const baseFormData: FormData = {
      conditionMode: 'range',
      operator: 'gte',
      targetPrice: '',
      rangeType: 'inside',
      minPrice: '',
      maxPrice: '',
      frequency: 'MINUTE_LEVEL',
      rangeInputMode: 'percentage',
      minPercentage: '',
      maxPercentage: '',
    };

    it('正常系: 基準価格とパーセンテージが設定され、計算結果が有効範囲内の場合、バリデーションが成功する', () => {
      const basePrice = 100;
      const minPercentage = -10;
      const maxPercentage = 10;
      const calculatedMinPrice = calculateTargetPriceFromPercentage(basePrice, minPercentage);
      const calculatedMaxPrice = calculateTargetPriceFromPercentage(basePrice, maxPercentage);
      const formData = {
        ...baseFormData,
        minPercentage: minPercentage.toString(),
        maxPercentage: maxPercentage.toString(),
        minPrice: calculatedMinPrice.toString(),
        maxPrice: calculatedMaxPrice.toString(),
      };
      const result = validateForm(formData, basePrice);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual({});
    });

    it('異常系: 基準価格が未設定（undefined）の場合、エラーが返される', () => {
      const formData = {
        ...baseFormData,
        minPercentage: '-10',
        maxPercentage: '10',
        minPrice: '90',
        maxPrice: '110',
      };
      const result = validateForm(formData, undefined);
      expect(result.valid).toBe(false);
      expect(result.errors.minPercentage).toBe(ERROR_MESSAGES.BASE_PRICE_REQUIRED);
      expect(result.errors.maxPercentage).toBe(ERROR_MESSAGES.BASE_PRICE_REQUIRED);
    });

    it('異常系: 基準価格が0以下の場合、エラーが返される', () => {
      const formData = {
        ...baseFormData,
        minPercentage: '-10',
        maxPercentage: '10',
        minPrice: '0',
        maxPrice: '0',
      };
      const result = validateForm(formData, 0);
      expect(result.valid).toBe(false);
      expect(result.errors.minPercentage).toBe(ERROR_MESSAGES.INVALID_BASE_PRICE);
      expect(result.errors.maxPercentage).toBe(ERROR_MESSAGES.INVALID_BASE_PRICE);
    });

    it('異常系: 最小パーセンテージが未選択の場合、エラーが返される', () => {
      const formData = {
        ...baseFormData,
        minPercentage: '',
        maxPercentage: '10',
        minPrice: '',
        maxPrice: '110',
      };
      const result = validateForm(formData, 100);
      expect(result.valid).toBe(false);
      expect(result.errors.minPercentage).toBe(ERROR_MESSAGES.PERCENTAGE_REQUIRED);
    });

    it('異常系: 最大パーセンテージが未選択の場合、エラーが返される', () => {
      const formData = {
        ...baseFormData,
        minPercentage: '-10',
        maxPercentage: '',
        minPrice: '90',
        maxPrice: '',
      };
      const result = validateForm(formData, 100);
      expect(result.valid).toBe(false);
      expect(result.errors.maxPercentage).toBe(ERROR_MESSAGES.PERCENTAGE_REQUIRED);
    });

    it('異常系: 計算された最小価格が0.01未満の場合、エラーが返される', () => {
      const formData = {
        ...baseFormData,
        minPercentage: '-100',
        maxPercentage: '10',
        minPrice: '0.001', // 0.01未満
        maxPrice: '110',
      };
      const result = validateForm(formData, 100);
      expect(result.valid).toBe(false);
      expect(result.errors.minPercentage).toBe(ERROR_MESSAGES.CALCULATED_MIN_PRICE_OUT_OF_RANGE);
    });

    it('異常系: 計算された最大価格が1,000,000を超える場合、エラーが返される', () => {
      const formData = {
        ...baseFormData,
        minPercentage: '0',
        maxPercentage: '1000',
        minPrice: '100000',
        maxPrice: '1100000', // 1,000,000超
      };
      const result = validateForm(formData, 100000);
      expect(result.valid).toBe(false);
      expect(result.errors.maxPercentage).toBe(ERROR_MESSAGES.CALCULATED_MAX_PRICE_OUT_OF_RANGE);
    });

    it('異常系: 計算された最小価格 >= 最大価格の場合（範囲内）、エラーが返される', () => {
      const formData = {
        ...baseFormData,
        minPercentage: '10',
        maxPercentage: '-10',
        minPrice: '110',
        maxPrice: '90',
        rangeType: 'inside',
      };
      const result = validateForm(formData, 100);
      expect(result.valid).toBe(false);
      expect(result.errors.minPercentage).toBe(ERROR_MESSAGES.INVALID_RANGE_INSIDE);
    });

    it('異常系: 計算された最小価格 >= 最大価格の場合（範囲外）、エラーが返される', () => {
      const formData = {
        ...baseFormData,
        minPercentage: '10',
        maxPercentage: '-10',
        minPrice: '110',
        maxPrice: '90',
        rangeType: 'outside',
      };
      const result = validateForm(formData, 100);
      expect(result.valid).toBe(false);
      expect(result.errors.minPercentage).toBe(ERROR_MESSAGES.INVALID_RANGE_OUTSIDE);
    });

    it('境界値: 計算された最小価格が0.01、最大価格が1,000,000の場合、バリデーションが成功する', () => {
      const formData = {
        ...baseFormData,
        minPercentage: '0',
        maxPercentage: '0',
        minPrice: '0.01',
        maxPrice: '1000000',
      };
      const result = validateForm(formData, 500000);
      expect(result.valid).toBe(true);
    });
  });

  describe('エラーメッセージの一貫性', () => {
    it('すべてのエラーメッセージが日本語で定義されている', () => {
      Object.values(ERROR_MESSAGES).forEach((message) => {
        expect(message).toMatch(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/); // 日本語文字を含む
        expect(message.length).toBeGreaterThan(0);
      });
    });

    it('パーセンテージ関連のエラーメッセージが定義されている', () => {
      expect(ERROR_MESSAGES.PERCENTAGE_REQUIRED).toBeDefined();
      expect(ERROR_MESSAGES.BASE_PRICE_REQUIRED).toBeDefined();
      expect(ERROR_MESSAGES.INVALID_BASE_PRICE).toBeDefined();
      expect(ERROR_MESSAGES.CALCULATED_PRICE_OUT_OF_RANGE).toBeDefined();
      expect(ERROR_MESSAGES.CALCULATED_MIN_PRICE_OUT_OF_RANGE).toBeDefined();
      expect(ERROR_MESSAGES.CALCULATED_MAX_PRICE_OUT_OF_RANGE).toBeDefined();
    });
  });
});
