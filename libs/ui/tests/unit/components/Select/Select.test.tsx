import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import Select, { type SelectOption } from '../../../../src/components/Select/Select';

const PERIOD_OPTIONS: ReadonlyArray<SelectOption> = [
  { value: '24h', label: '直近 24 時間' },
  { value: '7d', label: '直近 7 日' },
  { value: '30d', label: '直近 30 日' },
];

function ControlledSelect(props: Omit<React.ComponentProps<typeof Select>, 'onChange'>) {
  const [value, setValue] = React.useState(props.value);
  return <Select {...props} value={value} onChange={setValue} />;
}

describe('Select', () => {
  describe('rendering', () => {
    it('options を <option> として描画する', () => {
      render(
        <Select label="期間" value="24h" onChange={() => undefined} options={PERIOD_OPTIONS} />
      );
      const select = screen.getByLabelText('期間');
      expect(select).toBeInTheDocument();
      expect(select.tagName).toBe('SELECT');
      expect(screen.getByRole('option', { name: '直近 24 時間' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '直近 7 日' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '直近 30 日' })).toBeInTheDocument();
    });

    it('label を渡すと <label> が描画され、select と htmlFor で関連付けられる', () => {
      render(
        <Select label="期間" value="24h" onChange={() => undefined} options={PERIOD_OPTIONS} />
      );
      expect(screen.getByLabelText('期間')).toBeInTheDocument();
    });

    it('id を明示すれば尊重される', () => {
      render(
        <Select
          id="my-select"
          label="期間"
          value="24h"
          onChange={() => undefined}
          options={PERIOD_OPTIONS}
        />
      );
      expect(screen.getByLabelText('期間')).toHaveAttribute('id', 'my-select');
    });

    it('helperText が描画され、aria-describedby で関連付けられる', () => {
      render(
        <Select
          label="期間"
          value="24h"
          onChange={() => undefined}
          options={PERIOD_OPTIONS}
          helperText="集計対象とする期間"
        />
      );
      const select = screen.getByLabelText('期間');
      const helperId = select.getAttribute('aria-describedby');
      expect(helperId).toBeTruthy();
      expect(document.getElementById(helperId!)).toHaveTextContent('集計対象とする期間');
    });

    it('placeholder が指定されると先頭に空 option が描画される', () => {
      render(
        <Select
          label="期間"
          value=""
          onChange={() => undefined}
          options={PERIOD_OPTIONS}
          placeholder="選択してください"
        />
      );
      const placeholderOption = screen.getByRole('option', {
        name: '選択してください',
      }) as HTMLOptionElement;
      expect(placeholderOption.value).toBe('');
    });

    it('placeholder が指定されないと空 option は描画されない', () => {
      render(
        <Select label="期間" value="24h" onChange={() => undefined} options={PERIOD_OPTIONS} />
      );
      expect(screen.queryByRole('option', { name: '' })).not.toBeInTheDocument();
    });

    it('required かつ placeholder の場合、placeholder option は disabled になる', () => {
      render(
        <Select
          label="期間"
          value=""
          onChange={() => undefined}
          options={PERIOD_OPTIONS}
          placeholder="選択してください"
          required
        />
      );
      const placeholderOption = screen.getByRole('option', {
        name: '選択してください',
      }) as HTMLOptionElement;
      expect(placeholderOption.disabled).toBe(true);
    });

    it('option.disabled が true の項目は disabled として描画される', () => {
      render(
        <Select
          label="国"
          value="jp"
          onChange={() => undefined}
          options={[
            { value: 'jp', label: '日本' },
            { value: 'us', label: 'アメリカ', disabled: true },
          ]}
        />
      );
      const us = screen.getByRole('option', { name: 'アメリカ' }) as HTMLOptionElement;
      expect(us.disabled).toBe(true);
    });

    it('既定値（md / no fullWidth）が適用される', () => {
      const { container } = render(
        <Select label="期間" value="24h" onChange={() => undefined} options={PERIOD_OPTIONS} />
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain('size-md');
      expect(wrapper.className).not.toContain('fullWidth');
    });

    it('size を指定するとそのサイズクラスが適用される', () => {
      const { container } = render(
        <Select
          label="期間"
          value="24h"
          onChange={() => undefined}
          options={PERIOD_OPTIONS}
          size="lg"
        />
      );
      expect((container.firstChild as HTMLElement).className).toContain('size-lg');
    });

    it('fullWidth を指定すると fullWidth クラスが適用される', () => {
      const { container } = render(
        <Select
          label="期間"
          value="24h"
          onChange={() => undefined}
          options={PERIOD_OPTIONS}
          fullWidth
        />
      );
      expect((container.firstChild as HTMLElement).className).toContain('fullWidth');
    });

    it('required の場合、ラベルに視覚的な * が付与される', () => {
      const { container } = render(
        <Select
          label="期間"
          value="24h"
          onChange={() => undefined}
          options={PERIOD_OPTIONS}
          required
        />
      );
      expect(container.textContent).toContain('*');
    });

    it('aria-label が select 要素に伝わる', () => {
      render(
        <Select
          aria-label="期間選択"
          value="24h"
          onChange={() => undefined}
          options={PERIOD_OPTIONS}
        />
      );
      expect(screen.getByLabelText('期間選択')).toBeInTheDocument();
    });

    it('className が wrapper に追加される', () => {
      const { container } = render(
        <Select
          label="期間"
          value="24h"
          onChange={() => undefined}
          options={PERIOD_OPTIONS}
          className="custom-class"
        />
      );
      expect((container.firstChild as HTMLElement).className).toContain('custom-class');
    });
  });

  describe('events', () => {
    it('onChange が選択された value で発火する', async () => {
      const onChange = jest.fn();
      const user = userEvent.setup();
      render(<Select label="期間" value="24h" onChange={onChange} options={PERIOD_OPTIONS} />);
      await user.selectOptions(screen.getByLabelText('期間'), '7d');
      expect(onChange).toHaveBeenCalledWith('7d');
    });

    it('controlled で value が更新される', async () => {
      const user = userEvent.setup();
      render(<ControlledSelect label="期間" value="24h" options={PERIOD_OPTIONS} />);
      const select = screen.getByLabelText('期間') as HTMLSelectElement;
      await user.selectOptions(select, '30d');
      expect(select.value).toBe('30d');
    });

    it('disabled の時は変更できない', async () => {
      const onChange = jest.fn();
      const user = userEvent.setup();
      render(
        <Select label="期間" value="24h" onChange={onChange} options={PERIOD_OPTIONS} disabled />
      );
      await user.selectOptions(screen.getByLabelText('期間'), '7d').catch(() => undefined);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('onBlur / onFocus が発火する', async () => {
      const onBlur = jest.fn();
      const onFocus = jest.fn();
      const user = userEvent.setup();
      render(
        <>
          <Select
            label="期間"
            value="24h"
            onChange={() => undefined}
            options={PERIOD_OPTIONS}
            onBlur={onBlur}
            onFocus={onFocus}
          />
          <button type="button">外</button>
        </>
      );
      await user.click(screen.getByLabelText('期間'));
      expect(onFocus).toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: '外' }));
      expect(onBlur).toHaveBeenCalled();
    });
  });

  describe('error state', () => {
    it('error の場合、aria-invalid が true になる', () => {
      render(
        <Select
          label="期間"
          value="24h"
          onChange={() => undefined}
          options={PERIOD_OPTIONS}
          error
        />
      );
      expect(screen.getByLabelText('期間')).toHaveAttribute('aria-invalid', 'true');
    });

    it('error が false の場合、aria-invalid は付与されない', () => {
      render(
        <Select label="期間" value="24h" onChange={() => undefined} options={PERIOD_OPTIONS} />
      );
      expect(screen.getByLabelText('期間')).not.toHaveAttribute('aria-invalid');
    });

    it('error の場合、wrapper に error クラスが付与される', () => {
      const { container } = render(
        <Select
          label="期間"
          value="24h"
          onChange={() => undefined}
          options={PERIOD_OPTIONS}
          error
        />
      );
      expect((container.firstChild as HTMLElement).className).toContain('error');
    });
  });

  describe('a11y', () => {
    it('label 付きで axe 違反が無い', async () => {
      const { container } = render(
        <Select label="期間" value="24h" onChange={() => undefined} options={PERIOD_OPTIONS} />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('placeholder + required の組み合わせでも axe 違反が無い', async () => {
      const { container } = render(
        <Select
          label="国"
          value=""
          onChange={() => undefined}
          options={[{ value: 'jp', label: '日本' }]}
          placeholder="選択してください"
          required
        />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('error + helperText で axe 違反が無い', async () => {
      const { container } = render(
        <Select
          label="期間"
          value=""
          onChange={() => undefined}
          options={PERIOD_OPTIONS}
          error
          helperText="必須項目です"
        />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('forwardRef', () => {
    it('ref が wrapper の div に渡る', () => {
      const ref = React.createRef<HTMLDivElement>();
      render(
        <Select
          ref={ref}
          label="期間"
          value="24h"
          onChange={() => undefined}
          options={PERIOD_OPTIONS}
        />
      );
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });
});
