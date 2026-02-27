import { readFileSync } from 'fs';
import { join } from 'path';

describe('ThemeRegistry navigationItems', () => {
  const themeRegistryPath = join(__dirname, '../../../components/ThemeRegistry.tsx');
  const source = readFileSync(themeRegistryPath, 'utf-8');

  it('サマリー導線が /summaries を指している', () => {
    expect(source).toContain("{ label: 'サマリー', href: '/summaries' }");
  });

  it('サマリー導線は stocks:read 権限で制御されている', () => {
    expect(source).toContain("hasPermission(session.user.roles, 'stocks:read')");
  });
});
