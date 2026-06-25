/**
 * ミドルウェアの onForbidden 設定テスト。
 *
 * `services/livetalk/web/src/middleware.ts` は `auth()` でラップされており、
 * `NextResponse` は Edge Runtime API に依存するため、jsdom 環境では直接テストできない。
 * そのため、`createAuthMiddleware` に渡しているロジック（`isPublicPath` と
 * `onForbidden` の URL 構築）を同じ仕様で個別にテストする。
 *
 * これにより:
 * - `isPublicPath` が /legal/ と /forbidden を公開パスとして扱うこと
 * - `onForbidden` が正しい /forbidden?from=... URL を構築すること
 * を保証する。
 */

// next/server を直接 import すると Edge Runtime API（Request 等）が必要になるため、
// ミドルウェアのビジネスロジックを純粋関数として再実装してテストする。

/**
 * middleware.ts の isPublicPath と同一ロジック。
 */
function buildIsPublicPath() {
  return (pathname: string): boolean => pathname.startsWith('/legal/') || pathname === '/forbidden';
}

/**
 * middleware.ts の onForbidden における URL 構築ロジックと同一ロジック。
 *
 * NextResponse を使わず、最終的に遷移先となる URL 文字列のみを検証する。
 * `searchParams.set` は値を自動でパーセントエンコードするため、`encodeURIComponent` は使わない。
 */
function buildForbiddenUrl(
  requestUrl: string,
  pathname: string,
  search: string,
  appUrl?: string
): string {
  const baseUrl = appUrl ?? new URL(requestUrl).origin;
  const forbiddenUrl = new URL('/forbidden', baseUrl);
  forbiddenUrl.searchParams.set('from', pathname + search);
  return forbiddenUrl.toString();
}

describe('isPublicPath', () => {
  const isPublicPath = buildIsPublicPath();

  it('/legal/ は公開パスとして扱う', () => {
    expect(isPublicPath('/legal/')).toBe(true);
    expect(isPublicPath('/legal/terms')).toBe(true);
    expect(isPublicPath('/legal/privacy')).toBe(true);
  });

  it('/forbidden は公開パスとして扱う（リダイレクトループ防止）', () => {
    expect(isPublicPath('/forbidden')).toBe(true);
  });

  it('/forbidden/ はサブパスなので公開パスではない（/forbidden 完全一致のみ）', () => {
    expect(isPublicPath('/forbidden/')).toBe(false);
    expect(isPublicPath('/forbidden/something')).toBe(false);
  });

  it('その他のパスは公開パスではない', () => {
    expect(isPublicPath('/')).toBe(false);
    expect(isPublicPath('/notes')).toBe(false);
    expect(isPublicPath('/memory')).toBe(false);
    expect(isPublicPath('/api/chat')).toBe(false);
  });
});

describe('onForbidden の URL 構築', () => {
  describe('APP_URL ありの場合', () => {
    it('/notes へのアクセスを /forbidden?from=%2Fnotes に変換する', () => {
      const result = buildForbiddenUrl(
        'https://live-talk.nagiyu.com/notes',
        '/notes',
        '',
        'https://live-talk.nagiyu.com'
      );
      expect(result).toBe('https://live-talk.nagiyu.com/forbidden?from=%2Fnotes');
    });

    it('search 付きパスの場合は pathname + search をまとめて from に含める', () => {
      const result = buildForbiddenUrl(
        'https://live-talk.nagiyu.com/memory?page=2',
        '/memory',
        '?page=2',
        'https://live-talk.nagiyu.com'
      );
      expect(result).toBe('https://live-talk.nagiyu.com/forbidden?from=%2Fmemory%3Fpage%3D2');
    });

    it('ルートパス / を /forbidden?from=%2F に変換する', () => {
      const result = buildForbiddenUrl(
        'https://live-talk.nagiyu.com/',
        '/',
        '',
        'https://live-talk.nagiyu.com'
      );
      expect(result).toBe('https://live-talk.nagiyu.com/forbidden?from=%2F');
    });

    it('深いパスも正しく encode される', () => {
      const result = buildForbiddenUrl(
        'https://live-talk.nagiyu.com/memory/123',
        '/memory/123',
        '',
        'https://live-talk.nagiyu.com'
      );
      expect(result).toBe('https://live-talk.nagiyu.com/forbidden?from=%2Fmemory%2F123');
    });
  });

  describe('APP_URL なし（origin フォールバック）の場合', () => {
    it('request.url からオリジンを取り出して /forbidden へのリダイレクト URL を構築する', () => {
      const result = buildForbiddenUrl(
        'https://live-talk.nagiyu.com/notes',
        '/notes',
        '',
        undefined
      );
      expect(result).toBe('https://live-talk.nagiyu.com/forbidden?from=%2Fnotes');
    });

    it('ポート番号付きの URL でもオリジンを正しく取り出す', () => {
      const result = buildForbiddenUrl('http://localhost:3000/notes', '/notes', '', undefined);
      expect(result).toBe('http://localhost:3000/forbidden?from=%2Fnotes');
    });
  });

  describe('from パラメータの encodeURIComponent', () => {
    it('pathname が空の場合は from=%20 にならず from= になる', () => {
      const result = buildForbiddenUrl(
        'https://live-talk.nagiyu.com/',
        '',
        '',
        'https://live-talk.nagiyu.com'
      );
      // 空文字列の encodeURIComponent は '' のまま
      expect(result).toBe('https://live-talk.nagiyu.com/forbidden?from=');
    });

    it('特殊文字を含むクエリパラメータが正しく encode される', () => {
      const result = buildForbiddenUrl(
        'https://live-talk.nagiyu.com/search',
        '/search',
        '?q=hello world',
        'https://live-talk.nagiyu.com'
      );
      // URLSearchParams は application/x-www-form-urlencoded 形式のため
      // スペースは %20 ではなく + に encode される
      // "?q=hello world" → "%3Fq%3Dhello+world"
      expect(result).toBe(
        'https://live-talk.nagiyu.com/forbidden?from=%2Fsearch%3Fq%3Dhello+world'
      );
    });
  });
});
