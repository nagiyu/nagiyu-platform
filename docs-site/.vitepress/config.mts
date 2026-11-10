import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';
import { SIDEBAR_EXCLUDED, SITE_CONFIG } from '../src/constants';
import { buildSidebar, escapeInterpolation, readmeToIndex } from '../src/sidebar';
import { tokenize } from '../src/tokenize';

const docsDir = fileURLToPath(new URL('../../docs', import.meta.url));

export default withMermaid(
  defineConfig({
    ...SITE_CONFIG,
    srcDir: '../docs',
    cleanUrls: true,
    markdown: {
      // docs は GitHub 上の Markdown として書かれ、`<div>` や `{{ }}` は文字として読まれる。
      // Vue のテンプレートとして解釈させるとビルドが落ちる。
      html: false,
      config: (md) => {
        for (const rule of ['text', 'code_inline'] as const) {
          const original = md.renderer.rules[rule];
          if (!original) continue;
          md.renderer.rules[rule] = (tokens, idx, options, env, self) =>
            escapeInterpolation(original(tokens, idx, options, env, self));
        }
      },
    },
    lastUpdated: false,
    // docs は各ディレクトリの README.md を入口にしている。サイトではディレクトリの URL で開く。
    rewrites: readmeToIndex,
    themeConfig: {
      nav: [{ text: 'ホーム', link: '/' }],
      sidebar: buildSidebar(docsDir, SIDEBAR_EXCLUDED),
      outline: { level: [2, 3], label: '目次' },
      docFooter: { prev: '前へ', next: '次へ' },
      sidebarMenuLabel: 'メニュー',
      returnToTopLabel: 'ページ上部へ',
      darkModeSwitchLabel: '外観',
      search: {
        provider: 'local',
        options: {
          miniSearch: {
            options: { tokenize },
            searchOptions: { prefix: true, combineWith: 'AND' },
          },
          translations: {
            button: { buttonText: '検索', buttonAriaLabel: '検索' },
            modal: {
              displayDetails: '詳細を表示',
              resetButtonTitle: '検索をリセット',
              backButtonTitle: '検索を閉じる',
              noResultsText: '見つかりませんでした',
              footer: {
                selectText: '選択',
                selectKeyAriaLabel: 'Enter',
                navigateText: '移動',
                navigateUpKeyAriaLabel: '上',
                navigateDownKeyAriaLabel: '下',
                closeText: '閉じる',
                closeKeyAriaLabel: 'Esc',
              },
            },
          },
        },
      },
    },
  })
);
