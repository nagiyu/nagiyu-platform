import '@testing-library/jest-dom';
import { toHaveNoViolations } from 'jest-axe';

/**
 * jest-axe の `toHaveNoViolations` matcher を全テストで利用可能にする。
 * 各テストで `import { axe } from 'jest-axe'` した上で
 * `expect(await axe(container)).toHaveNoViolations()` のように使う。
 */
expect.extend(toHaveNoViolations);
