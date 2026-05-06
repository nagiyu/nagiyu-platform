'use client';

import * as React from 'react';

import styles from './TextField.module.css';

/**
 * TextField のサイズ。
 */
export type TextFieldSize = 'sm' | 'md' | 'lg';

/**
 * TextField の入力種別。HTML `type` 属性のうち、テキスト入力として意味のある値に絞る。
 */
export type TextFieldType = 'text' | 'password' | 'email' | 'number' | 'search' | 'tel' | 'url';

/**
 * TextField のプロパティ。
 *
 * 100% ライブラリ非依存の独自定義。MUI / Radix 等の Props 型は extends しない。
 * エスケープハッチは `className` のみ。
 */
export interface TextFieldProps {
  // ---- 値・イベント ----
  value?: string;
  defaultValue?: string;
  onChange?: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onBlur?: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onFocus?: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;

  // ---- 表示 ----
  /**
   * フォームラベル。`<label htmlFor>` で input/textarea と関連付ける。
   * 関連付けは内部で `useId` により自動生成（`id` を渡せばそれを尊重）。
   */
  label?: React.ReactNode;
  /**
   * プレースホルダー。
   */
  placeholder?: string;
  /**
   * 入力欄の下に表示される補助テキスト。`error` が true なら危険色で描画される。
   */
  helperText?: React.ReactNode;

  // ---- 種別 ----
  /**
   * 入力種別。既定: `text`
   */
  type?: TextFieldType;

  // ---- 状態 ----
  disabled?: boolean;
  required?: boolean;
  /**
   * MUI の `slotProps.input.readOnly` 相当。読み取り専用フィールド。
   */
  readOnly?: boolean;
  /**
   * エラー状態。境界線・helperText が危険色になり、`aria-invalid` が付与される。
   */
  error?: boolean;

  // ---- レイアウト ----
  /**
   * 親要素の幅いっぱいに広げる。既定: `false`
   */
  fullWidth?: boolean;
  /**
   * サイズ。既定: `md`
   */
  size?: TextFieldSize;

  // ---- 複数行 ----
  /**
   * `true` の場合、`<textarea>` として描画する。
   */
  multiline?: boolean;
  rows?: number;
  minRows?: number;
  maxRows?: number;

  // ---- 制約 ----
  /**
   * MUI の `slotProps.htmlInput.maxLength` 相当。HTML `maxlength` 属性を付与。
   */
  maxLength?: number;

  // ---- その他 HTML ----
  id?: string;
  name?: string;
  autoFocus?: boolean;
  autoComplete?: string;
  inputMode?: 'text' | 'numeric' | 'decimal' | 'tel' | 'email' | 'search' | 'url' | 'none';

  // ---- a11y ----
  /**
   * `label` 以外で名前を提供する場合に使用する。`label` が指定されている場合は不要。
   */
  'aria-label'?: string;

  // ---- エスケープハッチ ----
  className?: string;

  // ---- ref ----
  /**
   * 内部の `<input>` または `<textarea>` 要素への ref。
   */
  inputRef?: React.Ref<HTMLInputElement | HTMLTextAreaElement>;
}

/**
 * テキスト入力コンポーネント。
 *
 * - `label` と入力要素を `useId` 経由で自動関連付け（a11y 必須対応）
 * - `multiline` で `<textarea>` に切替
 * - `error` で危険色の境界線・helperText、`aria-invalid` 自動付与
 * - `readOnly` / `maxLength` を top-level Props として提供（MUI の slotProps を直接露出しない）
 *
 * @see docs/development/shared-ui-components.md
 */
const TextField = React.forwardRef<HTMLDivElement, TextFieldProps>(function TextField(
  {
    value,
    defaultValue,
    onChange,
    onBlur,
    onFocus,
    onKeyDown,
    label,
    placeholder,
    helperText,
    type = 'text',
    disabled = false,
    required = false,
    readOnly = false,
    error = false,
    fullWidth = false,
    size = 'md',
    multiline = false,
    rows,
    minRows,
    maxRows,
    maxLength,
    id,
    name,
    autoFocus,
    autoComplete,
    inputMode,
    'aria-label': ariaLabel,
    className,
    inputRef,
  },
  ref
) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  const helperTextId = `${inputId}-helper-text`;

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

  const sharedProps = {
    id: inputId,
    name,
    value,
    defaultValue,
    onChange,
    onBlur,
    onFocus,
    onKeyDown,
    placeholder,
    disabled,
    required,
    readOnly,
    autoFocus,
    autoComplete,
    inputMode,
    maxLength,
    'aria-label': ariaLabel,
    'aria-invalid': error || undefined,
    'aria-describedby': helperText ? helperTextId : undefined,
    className: styles.input,
  };

  return (
    <div ref={ref} className={wrapperClasses}>
      {label ? (
        <label htmlFor={inputId} className={styles.label}>
          {label}
          {required ? (
            <span aria-hidden="true" className={styles.requiredMark}>
              {' '}
              *
            </span>
          ) : null}
        </label>
      ) : null}
      {multiline ? (
        <textarea
          {...sharedProps}
          ref={inputRef as React.Ref<HTMLTextAreaElement>}
          rows={rows}
          // HTML の textarea は minRows/maxRows を直接サポートしないため、rows のみ反映する。
          // より高度な auto-resize は将来必要になれば追加する。
          {...(minRows && !rows ? { rows: minRows } : {})}
          {...(maxRows ? { 'data-max-rows': maxRows } : {})}
        />
      ) : (
        <input {...sharedProps} ref={inputRef as React.Ref<HTMLInputElement>} type={type} />
      )}
      {helperText ? (
        <p id={helperTextId} className={styles.helperText}>
          {helperText}
        </p>
      ) : null}
    </div>
  );
});

export default TextField;
