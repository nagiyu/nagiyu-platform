import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AlertsPage from '../../../app/alerts/page';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ back: jest.fn(), push: jest.fn() })),
  useSearchParams: jest.fn(() => ({ get: jest.fn(() => null) })),
}));

jest.mock('../../../components/AlertSettingsModal', () => ({
  __esModule: true,
  default: () => React.createElement('div', null, 'AlertSettingsModalMock'),
}));

jest.mock('../../../components/AlertDeleteConfirmDialog', () => ({
  __esModule: true,
  default: () => React.createElement('div', null, 'AlertDeleteConfirmDialogMock'),
}));

jest.mock('@nagiyu/ui', () => ({
  Button: ({ children }: Record<string, unknown>) => React.createElement('button', null, children),
  Chip: ({ children }: Record<string, unknown>) => React.createElement('span', null, children),
  ErrorAlert: () => React.createElement('div', null, 'ErrorAlertMock'),
  Select: ({ label }: Record<string, unknown>) => React.createElement('select', null, label),
}));

jest.mock('@mui/material', () => {
  const create =
    (tag: string) =>
    ({ children }: Record<string, unknown>) =>
      React.createElement(tag, null, children);
  return {
    Container: create('div'),
    Box: create('div'),
    Typography: create('span'),
    Table: create('table'),
    TableBody: create('tbody'),
    TableCell: create('td'),
    TableContainer: create('div'),
    TableHead: create('thead'),
    TableRow: create('tr'),
    Paper: create('div'),
    Alert: create('div'),
    CircularProgress: () => React.createElement('span', null, '読み込み中...'),
  };
});

jest.mock('@mui/icons-material', () => ({
  Edit: () => React.createElement('span', null, 'EditIcon'),
  Delete: () => React.createElement('span', null, 'DeleteIcon'),
  ArrowBack: () => React.createElement('span', null, 'ArrowBackIcon'),
}));

describe('AlertsPage', () => {
  let html: string;

  beforeAll(() => {
    html = renderToStaticMarkup(React.createElement(AlertsPage));
  });

  it('初期ローディング状態でクラッシュしない', () => {
    expect(html).toBeTruthy();
  });

  it('ローディングスピナーを表示する', () => {
    expect(html).toContain('読み込み中...');
  });

  it('アラート管理の見出しを表示する', () => {
    expect(html).toContain('アラート管理');
  });
});
