import {
  buildListsHref,
  buildListsQuery,
  buildSharedListHref,
  parseListsQuery,
} from '@/lib/listsQuery';

describe('listsQuery', () => {
  describe('parseListsQuery', () => {
    it('scope=shared のとき共有として groupId と listId を読み取る', () => {
      const result = parseListsQuery(
        new URLSearchParams('scope=shared&groupId=group-1&listId=list-1')
      );

      expect(result).toEqual({ scope: 'shared', groupId: 'group-1', listId: 'list-1' });
    });

    it('scope が無い場合は個人として扱う', () => {
      const result = parseListsQuery(new URLSearchParams('listId=list-1'));

      expect(result).toEqual({ scope: 'personal', groupId: '', listId: 'list-1' });
    });

    it('scope が未知の値でも個人として扱う', () => {
      const result = parseListsQuery(new URLSearchParams('scope=unknown'));

      expect(result.scope).toBe('personal');
    });

    it('クエリが空なら空文字で埋める', () => {
      expect(parseListsQuery(new URLSearchParams())).toEqual({
        scope: 'personal',
        groupId: '',
        listId: '',
      });
    });
  });

  describe('buildListsQuery / buildListsHref', () => {
    it('個人は scope と groupId を付けず listId だけにする', () => {
      const selection = { scope: 'personal', groupId: 'group-1', listId: 'list-1' } as const;

      expect(buildListsQuery(selection)).toBe('listId=list-1');
      expect(buildListsHref(selection)).toBe('/lists?listId=list-1');
    });

    it('共有は scope, groupId, listId をこの順で付ける', () => {
      const selection = { scope: 'shared', groupId: 'group-1', listId: 'list-1' } as const;

      expect(buildListsQuery(selection)).toBe('scope=shared&groupId=group-1&listId=list-1');
      expect(buildListsHref(selection)).toBe('/lists?scope=shared&groupId=group-1&listId=list-1');
    });

    it('ID に含まれる記号をエスケープする', () => {
      const href = buildListsHref({ scope: 'personal', groupId: '', listId: 'a&b=c' });

      expect(href).toBe('/lists?listId=a%26b%3Dc');
    });

    it('組み立てた結果を parseListsQuery で元の選択状態に戻せる', () => {
      const personal = { scope: 'personal', groupId: '', listId: 'list-1' } as const;
      const shared = { scope: 'shared', groupId: 'group-1', listId: 'list-2' } as const;

      expect(parseListsQuery(new URLSearchParams(buildListsQuery(personal)))).toEqual(personal);
      expect(parseListsQuery(new URLSearchParams(buildListsQuery(shared)))).toEqual(shared);
    });
  });

  describe('buildSharedListHref', () => {
    it('共有リストを開く URL を返す', () => {
      expect(buildSharedListHref('group-1', 'list-1')).toBe(
        '/lists?scope=shared&groupId=group-1&listId=list-1'
      );
    });
  });
});
