import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import LastVisitedPathTracker from '@/components/LastVisitedPathTracker';
import { LAST_VISITED_PATH_STORAGE_KEY } from '@/lib/lastVisitedPath';

const mockUsePathname = jest.fn<string | null, []>();

jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

describe('LastVisitedPathTracker', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockUsePathname.mockReset();
  });

  it('保存対象の pathname を LocalStorage に保存する', () => {
    mockUsePathname.mockReturnValue('/lists');
    render(<LastVisitedPathTracker />);
    expect(window.localStorage.getItem(LAST_VISITED_PATH_STORAGE_KEY)).toBe('/lists');
  });

  it('ルート "/" では保存しない', () => {
    mockUsePathname.mockReturnValue('/');
    render(<LastVisitedPathTracker />);
    expect(window.localStorage.getItem(LAST_VISITED_PATH_STORAGE_KEY)).toBeNull();
  });

  it('pathname が null の場合は保存しない', () => {
    mockUsePathname.mockReturnValue(null);
    render(<LastVisitedPathTracker />);
    expect(window.localStorage.getItem(LAST_VISITED_PATH_STORAGE_KEY)).toBeNull();
  });

  it('描画結果は何も出力しない', () => {
    mockUsePathname.mockReturnValue('/groups');
    const { container } = render(<LastVisitedPathTracker />);
    expect(container).toBeEmptyDOMElement();
  });
});
