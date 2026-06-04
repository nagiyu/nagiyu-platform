import { fireEvent, render, screen } from '@testing-library/react';
import MemoryTierTabs from '@/components/MemoryTierTabs';

describe('MemoryTierTabs', () => {
  it('A/B/C のタブを表示し、D は出さない', () => {
    render(<MemoryTierTabs value="A" onChange={jest.fn()} />);
    expect(screen.getByTestId('tier-tab-A')).toBeInTheDocument();
    expect(screen.getByTestId('tier-tab-B')).toBeInTheDocument();
    expect(screen.getByTestId('tier-tab-C')).toBeInTheDocument();
    expect(screen.queryByTestId('tier-tab-D')).not.toBeInTheDocument();
  });

  it('タブクリックで onChange が呼ばれる', () => {
    const onChange = jest.fn();
    render(<MemoryTierTabs value="A" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('tier-tab-B'));
    expect(onChange).toHaveBeenCalledWith('B');
  });
});
