/**
 * VideoCard のユニットテスト
 *
 * お気に入り・スキップの更新中にボタンを押せなくなることを検証する。
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { VideoData } from '@nagiyu/niconico-mylist-assistant-core';
import VideoCard from '../../../src/components/VideoCard';

jest.mock('@nagiyu/ui', () => ({
  Chip: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

const video: VideoData = {
  videoId: 'sm1',
  title: 'テスト動画',
  thumbnailUrl: 'https://example.com/thumb.jpg',
  length: '1:00',
  createdAt: 0,
};

describe('VideoCard', () => {
  it('既定ではお気に入り・スキップを押すとコールバックが呼ばれる', () => {
    const onToggleFavorite = jest.fn();
    const onToggleSkip = jest.fn();
    render(
      <VideoCard video={video} onToggleFavorite={onToggleFavorite} onToggleSkip={onToggleSkip} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'お気に入りに追加' }));
    fireEvent.click(screen.getByRole('button', { name: 'スキップに設定' }));

    expect(onToggleFavorite).toHaveBeenCalledWith('sm1', true);
    expect(onToggleSkip).toHaveBeenCalledWith('sm1', true);
  });

  it('disabled のときはお気に入り・スキップのボタンが無効になり、押してもコールバックが呼ばれない', () => {
    const onToggleFavorite = jest.fn();
    const onToggleSkip = jest.fn();
    render(
      <VideoCard
        video={video}
        onToggleFavorite={onToggleFavorite}
        onToggleSkip={onToggleSkip}
        disabled
      />
    );

    const favoriteButton = screen.getByRole('button', { name: 'お気に入りに追加' });
    const skipButton = screen.getByRole('button', { name: 'スキップに設定' });
    expect(favoriteButton).toBeDisabled();
    expect(skipButton).toBeDisabled();

    fireEvent.click(favoriteButton);
    fireEvent.click(skipButton);

    expect(onToggleFavorite).not.toHaveBeenCalled();
    expect(onToggleSkip).not.toHaveBeenCalled();
  });

  it('設定済みの動画では解除側のラベルになる', () => {
    render(
      <VideoCard
        video={{
          ...video,
          userSetting: {
            videoId: 'sm1',
            isFavorite: true,
            isSkip: true,
            createdAt: 0,
            updatedAt: 0,
          },
        }}
      />
    );

    expect(screen.getByRole('button', { name: 'お気に入り解除' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'スキップ解除' })).toBeEnabled();
  });
});
