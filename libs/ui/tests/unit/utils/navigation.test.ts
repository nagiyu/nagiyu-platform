import { findCurrentItem } from '../../../src/utils/navigation';
import type { NavigationTarget } from '../../../src/utils/navigation';

const hrefOf = (items: NavigationTarget[], pathname: string | null) =>
  findCurrentItem(items, pathname)?.href ?? null;

describe('findCurrentItem', () => {
  const items: NavigationTarget[] = [
    { href: '/' },
    { href: '/tech' },
    { href: '/mylist' },
    { href: '/mylist/register' },
    { href: '/about' },
    { href: '/search?q=1#top' },
    { href: '#' },
    {
      href: '#',
      children: [{ href: '/admin/users' }, { href: '/admin/settings' }],
    },
  ];

  it.each([
    ['/', '/'],
    ['/tech/some-article', '/tech'],
    ['/tech', '/tech'],
    ['/mylist/register', '/mylist/register'],
    ['/mylist/status/123', '/mylist'],
    ['/mylist/register/1', '/mylist/register'],
    ['/about/', '/about'],
    ['/search', '/search?q=1#top'],
    ['/admin/users', '/admin/users'],
    ['/admin/users/1', '/admin/users'],
  ])('%s の現在項目は %s', (pathname, expected) => {
    expect(hrefOf(items, pathname)).toBe(expected);
  });

  it('区切りをまたぐ前方一致は選ばない', () => {
    expect(hrefOf(items, '/tech-notes')).toBeNull();
  });

  it('/ は他のパスでは選ばない', () => {
    expect(hrefOf([{ href: '/' }], '/unknown')).toBeNull();
  });

  it('pathname が null のときは何も選ばない', () => {
    expect(hrefOf(items, null)).toBeNull();
  });

  it('/ で始まらない pathname は何も選ばない', () => {
    expect(hrefOf(items, 'tech')).toBeNull();
  });

  it('# の親は対象外で、子が選ばれたとき項目そのものを返す', () => {
    const child = { href: '/admin/settings' };
    const parent = { href: '#', children: [child] };
    expect(findCurrentItem([parent], '/admin/settings')).toBe(child);
    expect(findCurrentItem([parent], '/other')).toBeNull();
  });

  it('同じ href の別項目があっても 1 件だけ返す', () => {
    const a = { href: '/x' };
    const b = { href: '/x' };
    expect(findCurrentItem([a, b], '/x')).toBe(a);
  });

  it('親と子をまたいで最長一致を選ぶ', () => {
    const child = { href: '/docs/guide' };
    const list = [{ href: '/docs' }, { href: '#', children: [child] }];
    expect(findCurrentItem(list, '/docs/guide/intro')).toBe(child);
  });
});
