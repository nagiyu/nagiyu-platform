import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import { h } from 'vue';
import SpecCardMeta from './SpecCardMeta';
import './style.css';

// カード本文は変えず、Layout のスロットで frontmatter の情報を本文の上に足す
export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, { 'doc-before': () => h(SpecCardMeta) }),
} satisfies Theme;
