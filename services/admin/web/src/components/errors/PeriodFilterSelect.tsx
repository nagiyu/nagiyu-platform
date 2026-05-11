'use client';

import * as React from 'react';

import { Select, type SelectOption } from '@nagiyu/ui';

interface PeriodFilterSelectProps {
  defaultValue: string;
  options: ReadonlyArray<SelectOption>;
}

export default function PeriodFilterSelect({ defaultValue, options }: PeriodFilterSelectProps) {
  const [value, setValue] = React.useState(defaultValue);

  return (
    <Select
      name="period"
      label="期間"
      size="sm"
      value={value}
      onChange={setValue}
      options={options}
      fullWidth
    />
  );
}
