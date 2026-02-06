/**
 * フォームデータ変換ロジック - パーセンテージ選択時の価格計算
 *
 * このファイルはパーセンテージ選択時のフォームデータ変換ロジックを説明します。
 * Phase 2 (UI実装) で AlertSettingsModal.tsx に統合される予定です。
 */

import { calculateTargetPriceFromPercentage } from './percentage-helper';

/**
 * パーセンテージ選択時のフォームデータ変換戦略
 *
 * ## 概要
 *
 * ユーザーがパーセンテージモードを選択した場合、以下の変換処理を行う：
 * 1. 選択されたパーセンテージから実際の価格を計算
 * 2. 計算された価格を targetPrice/minPrice/maxPrice フィールドに設定
 * 3. API リクエストには計算後の価格値のみを送信
 * 4. inputMode, percentage, rangeInputMode, minPercentage, maxPercentage は UI 状態管理のみに使用
 *
 * ## 単一条件モード
 *
 * ### 手動入力モード (inputMode: 'manual')
 * - targetPrice: ユーザーが入力した価格をそのまま使用
 * - percentage: 未使用
 *
 * ### パーセンテージ選択モード (inputMode: 'percentage')
 * - basePrice と percentage から targetPrice を計算
 * - 計算式: targetPrice = calculateTargetPriceFromPercentage(basePrice, percentage)
 * - API 送信時は計算後の targetPrice のみを送信（percentage は送信しない）
 *
 * ### 実装例
 *
 * ```typescript
 * // handleCreate 関数内での処理
 * if (formData.conditionMode === 'single') {
 *   let targetPriceValue: number;
 *
 *   if (formData.inputMode === 'percentage' && basePrice) {
 *     // パーセンテージモード: 基準価格からパーセンテージで計算
 *     const percentage = parseFloat(formData.percentage || '0');
 *     targetPriceValue = calculateTargetPriceFromPercentage(basePrice, percentage);
 *   } else {
 *     // 手動入力モード: 入力された価格をそのまま使用
 *     targetPriceValue = parseFloat(formData.targetPrice);
 *   }
 *
 *   conditions = [
 *     {
 *       field: 'price' as const,
 *       operator: formData.operator,
 *       value: targetPriceValue,
 *     },
 *   ];
 * }
 * ```
 *
 * ## 範囲指定モード
 *
 * ### 手動入力モード (rangeInputMode: 'manual')
 * - minPrice, maxPrice: ユーザーが入力した価格をそのまま使用
 * - minPercentage, maxPercentage: 未使用
 *
 * ### パーセンテージ選択モード (rangeInputMode: 'percentage')
 * - basePrice と minPercentage から minPrice を計算
 * - basePrice と maxPercentage から maxPrice を計算
 * - 計算式:
 *   - minPrice = calculateTargetPriceFromPercentage(basePrice, minPercentage)
 *   - maxPrice = calculateTargetPriceFromPercentage(basePrice, maxPercentage)
 * - API 送信時は計算後の minPrice, maxPrice のみを送信（percentage情報は送信しない）
 *
 * ### 実装例
 *
 * ```typescript
 * // handleCreate 関数内での処理
 * if (formData.conditionMode === 'range') {
 *   let minPriceValue: number;
 *   let maxPriceValue: number;
 *
 *   if (formData.rangeInputMode === 'percentage' && basePrice) {
 *     // パーセンテージモード: 基準価格からパーセンテージで計算
 *     const minPercentage = parseFloat(formData.minPercentage || '0');
 *     const maxPercentage = parseFloat(formData.maxPercentage || '0');
 *     minPriceValue = calculateTargetPriceFromPercentage(basePrice, minPercentage);
 *     maxPriceValue = calculateTargetPriceFromPercentage(basePrice, maxPercentage);
 *   } else {
 *     // 手動入力モード: 入力された価格をそのまま使用
 *     minPriceValue = parseFloat(formData.minPrice);
 *     maxPriceValue = parseFloat(formData.maxPrice);
 *   }
 *
 *   if (formData.rangeType === 'inside') {
 *     // 範囲内（AND）
 *     conditions = [
 *       { field: 'price' as const, operator: 'gte' as const, value: minPriceValue },
 *       { field: 'price' as const, operator: 'lte' as const, value: maxPriceValue },
 *     ];
 *     logicalOperator = 'AND';
 *   } else {
 *     // 範囲外（OR）
 *     conditions = [
 *       { field: 'price' as const, operator: 'lte' as const, value: minPriceValue },
 *       { field: 'price' as const, operator: 'gte' as const, value: maxPriceValue },
 *     ];
 *     logicalOperator = 'OR';
 *   }
 * }
 * ```
 *
 * ## バリデーション追加事項
 *
 * パーセンテージモード選択時の追加バリデーション:
 *
 * ```typescript
 * // validateForm 関数に追加
 * if (formData.conditionMode === 'single') {
 *   if (formData.inputMode === 'percentage') {
 *     // パーセンテージモードの場合
 *     if (!basePrice || basePrice <= 0) {
 *       errors.inputMode = '基準価格が設定されていないため、パーセンテージ選択は利用できません';
 *     } else if (!formData.percentage) {
 *       errors.percentage = 'パーセンテージを選択してください';
 *     } else {
 *       // 計算結果が有効範囲内か確認
 *       const percentage = parseFloat(formData.percentage);
 *       const calculatedPrice = calculateTargetPriceFromPercentage(basePrice, percentage);
 *       if (calculatedPrice < 0.01 || calculatedPrice > 1000000) {
 *         errors.percentage = '計算結果が有効な価格範囲（0.01～1,000,000）を超えています';
 *       }
 *     }
 *   }
 * } else if (formData.conditionMode === 'range') {
 *   if (formData.rangeInputMode === 'percentage') {
 *     // パーセンテージモードの場合
 *     if (!basePrice || basePrice <= 0) {
 *       errors.rangeInputMode = '基準価格が設定されていないため、パーセンテージ選択は利用できません';
 *     } else {
 *       if (!formData.minPercentage) {
 *         errors.minPercentage = '最小パーセンテージを選択してください';
 *       }
 *       if (!formData.maxPercentage) {
 *         errors.maxPercentage = '最大パーセンテージを選択してください';
 *       }
 *
 *       // 計算結果が有効範囲内か確認
 *       if (formData.minPercentage && formData.maxPercentage) {
 *         const minPercentage = parseFloat(formData.minPercentage);
 *         const maxPercentage = parseFloat(formData.maxPercentage);
 *         const calculatedMinPrice = calculateTargetPriceFromPercentage(basePrice, minPercentage);
 *         const calculatedMaxPrice = calculateTargetPriceFromPercentage(basePrice, maxPercentage);
 *
 *         if (calculatedMinPrice < 0.01 || calculatedMinPrice > 1000000) {
 *           errors.minPercentage = '計算結果が有効な価格範囲（0.01～1,000,000）を超えています';
 *         }
 *         if (calculatedMaxPrice < 0.01 || calculatedMaxPrice > 1000000) {
 *           errors.maxPercentage = '計算結果が有効な価格範囲（0.01～1,000,000）を超えています';
 *         }
 *
 *         // 範囲の妥当性チェック（最小価格 < 最大価格）
 *         if (calculatedMinPrice >= calculatedMaxPrice) {
 *           errors.minPercentage = '最小パーセンテージは最大パーセンテージより小さい値を選択してください';
 *         }
 *       }
 *     }
 *   }
 * }
 * ```
 *
 * ## リアルタイム表示
 *
 * パーセンテージ選択時、計算された価格をリアルタイムで表示:
 *
 * ```typescript
 * // 単一条件モードの表示例
 * {formData.inputMode === 'percentage' && basePrice && formData.percentage && (
 *   <Typography variant="body2" color="text.secondary">
 *     基準価格: {formatPrice(basePrice)}円 →
 *     目標価格: {formatPrice(calculateTargetPriceFromPercentage(
 *       basePrice,
 *       parseFloat(formData.percentage)
 *     ))}円 ({formData.percentage > 0 ? '+' : ''}{formData.percentage}%)
 *   </Typography>
 * )}
 *
 * // 範囲指定モードの表示例
 * {formData.rangeInputMode === 'percentage' && basePrice && formData.minPercentage && formData.maxPercentage && (
 *   <Typography variant="body2" color="text.secondary">
 *     基準価格: {formatPrice(basePrice)}円 →
 *     範囲: {formatPrice(calculateTargetPriceFromPercentage(
 *       basePrice,
 *       parseFloat(formData.minPercentage)
 *     ))}円 ～ {formatPrice(calculateTargetPriceFromPercentage(
 *       basePrice,
 *       parseFloat(formData.maxPercentage)
 *     ))}円
 *   </Typography>
 * )}
 * ```
 *
 * ## まとめ
 *
 * - **UI 状態管理**: inputMode, percentage, rangeInputMode, minPercentage, maxPercentage
 * - **API 送信データ**: targetPrice, minPrice, maxPrice（計算後の価格値のみ）
 * - **変換タイミング**: handleCreate 関数内で API 送信直前に変換
 * - **バリデーション**: basePrice の存在確認、計算結果の範囲チェック
 * - **リアルタイム表示**: 選択時に計算結果を表示してユーザーに確認させる
 */

// このファイルは Phase 2 (UI実装) で AlertSettingsModal.tsx に統合されます
export {};
