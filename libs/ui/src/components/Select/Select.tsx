'use client';

import * as React from 'react';

import styles from './Select.module.css';

export type SelectSize = 'sm' | 'md' | 'lg';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * Select のプロパティ。
 *
 * 100% ライブラリ非依存の独自定義。MUI / Radix 等の Props 型は extends しない。
 * エスケープハッチは `className` のみ。`value` と `onChange` は必須（uncontrolled は非対応）。
 */
export interface SelectProps {
  // ---- 値・イベント ----
  /**
   * 選択中の value。未選択を表現したい場合は空文字を渡し、`placeholder` を指定する。
   */
  value: string;
  /**
   * 値が変化したときのコールバック。MUI 等のイベントオブジェクトではなく、選択された
   * `value` を直接受け取るシグネチャ。
   */
  onChange: (value: string) => void;
  onBlur?: (event: React.FocusEvent<HTMLSelectElement>) => void;
  onFocus?: (event: React.FocusEvent<HTMLSelectElement>) => void;

  // ---- データ ----
  /**
   * 選択肢の配列。`MenuItem` のネスト記述ではなく設定駆動 API。
   */
  options: ReadonlyArray<SelectOption>;

  // ---- 表示 ----
  /**
   * フォームラベル。`<label htmlFor>` で select と関連付ける（内部 `useId` で自動生成）。
   */
  label?: React.ReactNode;
  /**
   * 未選択（空文字）状態に表示する案内テキスト。指定すると先頭に空 option を挿入する。
   */
  placeholder?: string;
  /**
   * 入力欄の下に表示される補助テキスト。`error` が true なら危険色で描画される。
   */
  helperText?: React.ReactNode;

  // ---- 状態 ----
  disabled?: boolean;
  required?: boolean;
  /**
   * エラー状態。境界線・helperText が危険色になり、`aria-invalid` が付与される。
   */
  error?: boolean;

  // ---- レイアウト ----
  fullWidth?: boolean;
  /**
   * サイズ。既定: `md`
   */
  size?: SelectSize;

  // ---- その他 HTML ----
  id?: string;
  name?: string;
  autoFocus?: boolean;

  // ---- a11y ----
  'aria-label'?: string;

  // ---- エスケープハッチ ----
  className?: string;
}

/**
 * 単一選択 dropdown コンポーネント。
 *
 * - ネイティブ `<select>` をラップしているため、ARIA / キーボード操作 / モバイル UI は OS 標準に追従
 * - `label` と select は `useId` 経由で自動関連付け（a11y 必須対応）
 * - `placeholder` 指定時は先頭に空 option を挿入（未選択を明示）
 * - `error` で危険色の境界線・helperText、`aria-invalid` 自動付与
 *
 * @see docs/development/shared-ui-components.md
 */
const Select = React.forwardRef<HTMLDivElement, SelectProps>(function Select(
  {
    value,
    onChange,
    onBlur,
    onFocus,
    options,
    label,
    placeholder,
    helperText,
    disabled = false,
    required = false,
    error = false,
    fullWidth = false,
    size = 'md',
    id,
    name,
    autoFocus,
    'aria-label': ariaLabel,
    className,
  },
  ref
) {
  const generatedId = React.useId();
  const selectId = id ?? generatedId;
  const helperTextId = `${selectId}-helper-text`;

  const wrapperClasses = [
    styles.wrapper,
    fullWidth ? styles.fullWidth : null,
    disabled ? styles.disabled : null,
    error ? styles.error : null,
    styles[`size-${size}`],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={ref} className={wrapperClasses}>
      {label ? (
        <label htmlFor={selectId} className={styles.label}>
          {label}
          {required ? (
            <span aria-hidden="true" className={styles.requiredMark}>
              {' '}
              *
            </span>
          ) : null}
        </label>
      ) : null}
      <div className={styles.selectWrapper}>
        <select
          id={selectId}
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          onFocus={onFocus}
          disabled={disabled}
          required={required}
          autoFocus={autoFocus}
          aria-label={ariaLabel}
          aria-invalid={error || undefined}
          aria-describedby={helperText ? helperTextId : undefined}
          className={styles.select}
        >
          {placeholder !== undefined ? (
            <option value="" disabled={required}>
              {placeholder}
            </option>
          ) : null}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <span aria-hidden="true" className={styles.chevron}>
          ▾
        </span>
      </div>
      {helperText ? (
        <p id={helperTextId} className={styles.helperText}>
          {helperText}
        </p>
      ) : null}
    </div>
  );
});

export default Select;
