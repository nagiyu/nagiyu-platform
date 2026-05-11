'use client';

import * as React from 'react';

import styles from './Checkbox.module.css';

/**
 * Checkbox のサイズ。
 */
export type CheckboxSize = 'sm' | 'md' | 'lg';

/**
 * Checkbox のプロパティ。
 *
 * 100% ライブラリ非依存の独自定義。MUI / Radix 等の Props 型は extends しない。
 * エスケープハッチは `className` のみ。
 */
export interface CheckboxProps {
  // ---- 値・イベント ----
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;

  // ---- 表示 ----
  /**
   * チェックボックス右側に表示するラベル。
   * 渡すと `<label>` で input と関連付けて 1 コンポーネントで完結する
   * （MUI の `<FormControlLabel control={<Checkbox/>} label="..."/>` 相当）。
   */
  label?: React.ReactNode;

  // ---- 状態 ----
  disabled?: boolean;
  required?: boolean;
  /**
   * 部分選択状態。`true` のとき、HTML の `indeterminate` DOM プロパティを設定し、
   * 視覚的にも横棒（ダッシュ）アイコンを表示する。
   */
  indeterminate?: boolean;

  // ---- サイズ ----
  /**
   * サイズ。既定: `md`
   */
  size?: CheckboxSize;

  // ---- その他 HTML ----
  id?: string;
  name?: string;
  value?: string;
  autoFocus?: boolean;

  // ---- a11y ----
  /**
   * `label` 以外で名前を提供する場合に使用する。`label` が指定されている場合は不要。
   */
  'aria-label'?: string;
  'aria-labelledby'?: string;

  // ---- エスケープハッチ ----
  className?: string;

  // ---- ref ----
  /**
   * 内部の `<input type="checkbox">` 要素への ref。
   */
  inputRef?: React.Ref<HTMLInputElement>;
}

/**
 * チェックボックスコンポーネント。
 *
 * - `label` を渡せば `<label>` で input と自動関連付け（a11y 必須対応）
 * - `indeterminate` で DOM プロパティと視覚（横棒アイコン）を同期
 * - 視覚的に隠した native `<input type="checkbox">` を CSS で再描画
 *
 * @see docs/development/shared-ui-components.md
 */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  {
    checked,
    defaultChecked,
    onChange,
    label,
    disabled = false,
    required = false,
    indeterminate = false,
    size = 'md',
    id,
    name,
    value,
    autoFocus,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    className,
    inputRef,
  },
  ref
) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;

  // 内部 ref を作り、外部から渡された ref とマージする。
  // indeterminate は HTML 属性ではなく DOM プロパティなので useEffect で同期。
  const internalRef = React.useRef<HTMLInputElement | null>(null);
  React.useEffect(() => {
    if (internalRef.current) {
      internalRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  const setRefs = React.useCallback(
    (node: HTMLInputElement | null) => {
      internalRef.current = node;
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
      }
      if (typeof inputRef === 'function') {
        inputRef(node);
      } else if (inputRef) {
        (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
      }
    },
    [ref, inputRef]
  );

  const wrapperClasses = [
    styles.wrapper,
    disabled ? styles.disabled : null,
    styles[`size-${size}`],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const inputElement = (
    <span className={styles.root}>
      <input
        ref={setRefs}
        id={inputId}
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        defaultChecked={defaultChecked}
        onChange={onChange}
        disabled={disabled}
        required={required}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className={styles.input}
      />
      <span className={styles.box} aria-hidden="true">
        {/* チェックマーク（checked 時に表示） */}
        <svg className={styles.checkIcon} viewBox="0 0 24 24" focusable="false">
          <path d="M9 16.17 4.83 12l-1.41 1.41L9 19 21 7l-1.41-1.41z" />
        </svg>
        {/* 横棒（indeterminate 時に表示） */}
        <svg className={styles.dashIcon} viewBox="0 0 24 24" focusable="false">
          <path d="M19 13H5v-2h14v2z" />
        </svg>
      </span>
    </span>
  );

  if (label) {
    return (
      <label htmlFor={inputId} className={wrapperClasses}>
        {inputElement}
        <span className={styles.labelText}>
          {label}
          {required ? (
            <span aria-hidden="true" className={styles.requiredMark}>
              {' '}
              *
            </span>
          ) : null}
        </span>
      </label>
    );
  }

  return <span className={wrapperClasses}>{inputElement}</span>;
});

export default Checkbox;
