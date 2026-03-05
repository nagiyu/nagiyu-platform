import type { AlertCondition } from '@nagiyu/stock-tracker-core';

type UpdateConditionInput = Partial<AlertCondition>;

/**
 * 既存条件と更新条件をインデックス対応でマージする。
 * 更新配列に要素が存在しないインデックスは既存条件をそのまま保持する。
 */
export function mergeAlertConditions(
  existingConditions: AlertCondition[],
  updateConditions: UpdateConditionInput[]
): AlertCondition[] {
  return existingConditions.map((existingCondition, index) => {
    const updateCondition = updateConditions[index];
    if (!updateCondition) {
      return existingCondition;
    }

    const mergedCondition: AlertCondition = {
      field: updateCondition.field ?? existingCondition.field,
      operator: updateCondition.operator ?? existingCondition.operator,
      value: updateCondition.value ?? existingCondition.value,
    };

    if (updateCondition.isPercentage === true) {
      mergedCondition.isPercentage = true;
      if (typeof updateCondition.percentageValue === 'number') {
        mergedCondition.percentageValue = updateCondition.percentageValue;
      } else if (typeof existingCondition.percentageValue === 'number') {
        mergedCondition.percentageValue = existingCondition.percentageValue;
      }
    } else if (updateCondition.isPercentage === false) {
      mergedCondition.isPercentage = false;
    } else {
      // isPercentage 未指定時は、既存条件の設定（手動/パーセンテージ）を維持する
      mergedCondition.isPercentage = existingCondition.isPercentage;
      if (typeof existingCondition.percentageValue === 'number') {
        mergedCondition.percentageValue = existingCondition.percentageValue;
      }
    }

    if (mergedCondition.isPercentage !== true) {
      delete mergedCondition.percentageValue;
    }

    return mergedCondition;
  });
}
