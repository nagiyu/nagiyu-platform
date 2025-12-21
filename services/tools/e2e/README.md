# E2E Tests for Tools App

This directory contains End-to-End (E2E) tests for the Tools application using Playwright.

## Test Files

- `accessibility.spec.ts` - WCAG 2.1 Level AA accessibility compliance tests
- `homepage.spec.ts` - Homepage functionality and responsive layout tests
- `transit-converter.spec.ts` - Transit converter tool functionality tests
- `migration-dialog.spec.ts` - Migration dialog display and interaction tests
- `pwa.spec.ts` - Progressive Web App functionality tests
- `basic.spec.ts` - Basic smoke tests
- `helpers.ts` - Shared test helpers and fixtures

## Accessibility Tests (@a11y)

The accessibility tests verify WCAG 2.1 Level AA compliance using `@axe-core/playwright`.

### Test Coverage

#### Pages Tested
- Homepage (tool listing)
- Transit Converter tool page (all states)
- Offline page

#### WCAG 2.1 Compliance Checks

**Perceivable**
- Text alternatives (alt attributes)
- Semantic HTML structure
- Color contrast ratios (minimum 4.5:1 for normal text)

**Operable**
- Keyboard accessibility
- Focus visibility
- Navigation (ARIA labels and roles)

**Understandable**
- Readable content
- Predictable behavior
- Error identification and suggestions

**Robust**
- Valid HTML syntax
- Proper Name, Role, Value attributes

### Running Accessibility Tests

```bash
# Run all accessibility tests on desktop
npx playwright test --grep @a11y --project=chromium-desktop

# Run all accessibility tests on all configured browsers
npx playwright test --grep @a11y

# Generate HTML report
npx playwright test --grep @a11y --reporter=html
npx playwright show-report
```

### Accessibility Fixes Applied

The following WCAG 2.1 Level AA violations were identified and fixed:

1. **Color Contrast - Primary Button**
   - Issue: Blue button color (#1976d2) had contrast ratio of 4.4:1 on light background
   - Fix: Changed primary color to #1565c0 (contrast ratio 4.55:1)
   - Location: `src/styles/theme.ts`

2. **Color Contrast - Footer Links**
   - Issue: Gray footer links (#949494) had contrast ratio of 2.61:1 on gray background
   - Fix: Changed from `text.disabled` to `text.secondary` color (contrast ratio 4.58:1)
   - Location: `src/components/layout/Footer.tsx`

### Test States Covered

#### Homepage
- Initial page load
- With migration dialog dismissed

#### Transit Converter
- Initial empty state
- After text input
- After successful conversion
- With error state

#### Common Components
- Header navigation
- Footer links

### Limitations

The automated accessibility tests using axe-core can only detect approximately 30-40% of WCAG issues. Manual testing is still required for:

- Keyboard navigation flow
- Screen reader compatibility
- Focus management
- Time-based media alternatives
- Complex interactive components

## Test Helpers

### makeAxeBuilder

Custom Playwright fixture that provides preconfigured axe-core scanner:

```typescript
const accessibilityScanResults = await makeAxeBuilder()
  .analyze();
```

The fixture is automatically configured to test against WCAG 2.1 Level A and AA tags:
- wcag2a
- wcag2aa
- wcag21a
- wcag21aa

### dismissMigrationDialogIfVisible

Helper function to dismiss the migration dialog if it appears during tests:

```typescript
await dismissMigrationDialogIfVisible(page);
```

## CI/CD Integration

Accessibility tests run in the GitHub Actions PR workflow (`tools-pr.yml`):

```yaml
accessibility-test:
  name: Run Accessibility Tests
  runs-on: ubuntu-latest
  steps:
    - name: Run Accessibility tests (WCAG 2.1 Level AA)
      run: npx playwright test --grep @a11y --project=chromium-desktop
```

The workflow fails if any WCAG 2.1 Level AA violations are detected.

## References

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [axe-core GitHub](https://github.com/dequelabs/axe-core)
- [@axe-core/playwright Documentation](https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright)
- [Playwright Documentation](https://playwright.dev/)
