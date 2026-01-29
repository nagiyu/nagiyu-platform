/**
 * Backwards compatibility layer for old API
 * 
 * This module provides compatibility wrappers that combine VIDEO and USER_SETTING entities
 * to maintain the old API interface while using the new Single Table Design underneath.
 */

import {
  getVideoBasicInfo,
  getUserVideoSetting,
  createUserVideoSetting,
  upsertUserVideoSetting,
  updateUserVideoSetting as updateUserSetting,
  listUserVideoSettings,
  deleteUserVideoSetting,
  batchGetVideoBasicInfo,
} from './videos';
import type { VideoBasicInfo, UserVideoSetting, VideoSettingUpdate } from '../types';

/**
 * Combined video type (for backwards compatibility)
 */
export interface Video {
  videoId: string;
  title: string;
  description?: string;
  thumbnailUrl: string;
  duration?: number;
  viewCount?: number;
  commentCount?: number;
  mylistCount?: number;
  uploadedAt?: string;
  tags?: string[];
  length?: string;
  isFavorite: boolean;
  isSkip: boolean;
  memo?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Video settings type (for backwards compatibility)
 */
export interface VideoSettings {
  isFavorite?: boolean;
  isSkip?: boolean;
  memo?: string;
}

/**
 * Get video with user settings combined
 * @deprecated Use getVideoBasicInfo and getUserVideoSetting separately
 */
export async function getVideo(userId: string, videoId: string): Promise<Video | null> {
  const [basicInfo, setting] = await Promise.all([
    getVideoBasicInfo(videoId),
    getUserVideoSetting(userId, videoId),
  ]);

  if (!basicInfo) {
    return null;
  }

  // If no setting exists, return with defaults
  return {
    videoId: basicInfo.videoId,
    title: basicInfo.title,
    thumbnailUrl: basicInfo.thumbnailUrl,
    length: basicInfo.length,
    isFavorite: setting?.isFavorite ?? false,
    isSkip: setting?.isSkip ?? false,
    memo: setting?.memo,
    createdAt: setting?.createdAt ?? basicInfo.createdAt,
    updatedAt: setting?.updatedAt ?? basicInfo.createdAt,
  };
}

/**
 * Create video with initial user settings
 * @deprecated Use createVideoBasicInfo and createUserVideoSetting separately
 */
export async function createVideo(userId: string, video: Video): Promise<void> {
  // Note: This assumes the video basic info already exists or should be created
  // In the new design, VIDEO entities should be created separately
  // This is just for compatibility with existing web code
  
  await upsertUserVideoSetting({
    userId,
    videoId: video.videoId,
    isFavorite: video.isFavorite ?? false,
    isSkip: video.isSkip ?? false,
    memo: video.memo,
  });
}

/**
 * Update video settings
 * @deprecated Use updateUserVideoSetting directly
 */
export async function updateVideoSettings(
  userId: string,
  videoId: string,
  settings: VideoSettings
): Promise<void> {
  await updateUserSetting(userId, videoId, settings as VideoSettingUpdate);
}

/**
 * Delete video (removes user settings)
 * @deprecated Use deleteUserVideoSetting directly
 */
export async function deleteVideo(userId: string, videoId: string): Promise<void> {
  await deleteUserVideoSetting(userId, videoId);
}

/**
 * List videos with user settings
 * @deprecated Use listUserVideoSettings and batch fetch video info separately
 */
export async function listVideos(
  userId: string,
  options?: {
    filter?: 'favorite' | 'skip' | 'all';
    limit?: number;
    lastEvaluatedKey?: Record<string, string>;
  }
): Promise<{ videos: Video[]; lastEvaluatedKey?: Record<string, string> }> {
  // Get user settings
  const { settings, lastEvaluatedKey } = await listUserVideoSettings(userId, options);

  // Get video basic info for all settings
  const videoIds = settings.map((s) => s.videoId);
  const basicInfos = videoIds.length > 0 ? await batchGetVideoBasicInfo(videoIds) : [];

  // Create a map for quick lookup
  const basicInfoMap = new Map<string, VideoBasicInfo>();
  basicInfos.forEach((info) => basicInfoMap.set(info.videoId, info));

  // Apply filter if specified
  let filteredSettings = settings;
  if (options?.filter === 'favorite') {
    filteredSettings = settings.filter((s) => s.isFavorite);
  } else if (options?.filter === 'skip') {
    filteredSettings = settings.filter((s) => s.isSkip);
  }

  // Combine settings with basic info
  const videos: Video[] = filteredSettings
    .map((setting) => {
      const basicInfo = basicInfoMap.get(setting.videoId);
      if (!basicInfo) {
        return null; // Skip if basic info not found
      }

      return {
        videoId: setting.videoId,
        title: basicInfo.title,
        thumbnailUrl: basicInfo.thumbnailUrl,
        length: basicInfo.length,
        isFavorite: setting.isFavorite,
        isSkip: setting.isSkip,
        memo: setting.memo,
        createdAt: setting.createdAt,
        updatedAt: setting.updatedAt,
      } as Video;
    })
    .filter((v): v is Video => v !== null);

  return {
    videos,
    lastEvaluatedKey,
  };
}
