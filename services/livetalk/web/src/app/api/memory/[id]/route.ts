import { NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import type { MemoryEntity } from '@nagiyu/livetalk-core';
import { getSession } from '@/lib/server/session';
import { getMemoryRepository } from '@/lib/server/repositories';
import { getEmbeddingClient } from '@/lib/server/embedding';
import { decodeMemoryId } from '@/lib/memory/memory-id';
import { validateMemoryPatch } from '@/lib/memory/validation';
import { toMemoryListItem } from '@/lib/memory/serializer';
import { MEMORY_ERROR_MESSAGES, PATCH_ERROR_TO_MESSAGE } from '../constants';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * content 編集時に embedding を再生成する。失敗しても編集自体は継続する（fail-warn）。
 */
async function regenerateEmbedding(content: string): Promise<number[] | undefined> {
  try {
    return await getEmbeddingClient().embed(content);
  } catch (error) {
    console.warn('[memory] embedding 再生成に失敗しました（embedding なしで継続）', error);
    return undefined;
  }
}

/**
 * GET /api/memory/:id
 *
 * 単一の記憶を返す。`:id` は base64url エンコードした完全 SK。
 */
export const GET = withAuth(
  getSession,
  'livetalk:chat',
  async (session, _request: Request, context: RouteContext) => {
    const { id } = await context.params;
    const key = decodeMemoryId(id, session.user.googleId);
    if (!key) {
      return NextResponse.json(
        { error: 'INVALID_ID', message: MEMORY_ERROR_MESSAGES.INVALID_ID },
        { status: 400 }
      );
    }

    try {
      const memory = await getMemoryRepository().get(key);
      if (!memory) {
        return NextResponse.json(
          { error: 'NOT_FOUND', message: MEMORY_ERROR_MESSAGES.NOT_FOUND },
          { status: 404 }
        );
      }
      return NextResponse.json({ memory: toMemoryListItem(memory) });
    } catch (error) {
      console.error('[GET /api/memory/:id] 記憶の取得に失敗しました', error);
      return NextResponse.json(
        { error: 'FETCH_FAILED', message: MEMORY_ERROR_MESSAGES.FETCH_FAILED },
        { status: 500 }
      );
    }
  }
);

/**
 * PATCH /api/memory/:id
 *
 * content / category を編集する。
 * - content 変更時は embedding を再生成する（次回チャットの retrieve に反映）。
 * - category 変更は SK 変更を伴うため delete(旧) + put(新) で実現する（MemoryID は維持）。
 * - content のみの変更は同一 SK の update で済ませる。
 */
export const PATCH = withAuth(
  getSession,
  'livetalk:chat',
  async (session, request: Request, context: RouteContext) => {
    const { id } = await context.params;
    const key = decodeMemoryId(id, session.user.googleId);
    if (!key) {
      return NextResponse.json(
        { error: 'INVALID_ID', message: MEMORY_ERROR_MESSAGES.INVALID_ID },
        { status: 400 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: MEMORY_ERROR_MESSAGES.INVALID_REQUEST },
        { status: 400 }
      );
    }

    const validation = validateMemoryPatch(body);
    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.error, message: PATCH_ERROR_TO_MESSAGE[validation.error] },
        { status: 400 }
      );
    }

    const { content, category } = validation.value;
    const repo = getMemoryRepository();

    try {
      const existing = await repo.get(key);
      if (!existing) {
        return NextResponse.json(
          { error: 'NOT_FOUND', message: MEMORY_ERROR_MESSAGES.NOT_FOUND },
          { status: 404 }
        );
      }

      const nextContent = content ?? existing.Content;
      const embedding = content !== undefined ? await regenerateEmbedding(nextContent) : undefined;

      let updated: MemoryEntity;
      if (category !== undefined && category !== existing.Category) {
        // category は SK の一部なので delete(旧) + put(新)。MemoryID は維持する。
        const newEntity: MemoryEntity = {
          ...existing,
          Category: category,
          Content: nextContent,
          ...(embedding !== undefined ? { Embedding: embedding } : {}),
        };
        updated = await repo.put({
          UserID: newEntity.UserID,
          CharacterID: newEntity.CharacterID,
          MemoryID: newEntity.MemoryID,
          Tier: newEntity.Tier,
          Category: newEntity.Category,
          Content: newEntity.Content,
          Confidence: newEntity.Confidence,
          ReferencedCount: newEntity.ReferencedCount,
          LastReferencedAt: newEntity.LastReferencedAt,
          Embedding: newEntity.Embedding,
        });
        await repo.delete(key);
      } else {
        // 同一 SK の更新（content のみ、または変化なし category）。
        updated = await repo.update({
          UserID: key.userId,
          CharacterID: key.characterId,
          MemoryID: key.memoryId,
          Tier: key.tier,
          Category: key.category,
          ...(content !== undefined ? { Content: content } : {}),
          ...(embedding !== undefined ? { Embedding: embedding } : {}),
        });
      }

      return NextResponse.json({ memory: toMemoryListItem(updated) });
    } catch (error) {
      console.error('[PATCH /api/memory/:id] 記憶の更新に失敗しました', error);
      return NextResponse.json(
        { error: 'UPDATE_FAILED', message: MEMORY_ERROR_MESSAGES.UPDATE_FAILED },
        { status: 500 }
      );
    }
  }
);

/**
 * DELETE /api/memory/:id
 *
 * 記憶を物理削除する。削除後は次回チャットの retrieve 対象から外れる。
 */
export const DELETE = withAuth(
  getSession,
  'livetalk:chat',
  async (session, _request: Request, context: RouteContext) => {
    const { id } = await context.params;
    const key = decodeMemoryId(id, session.user.googleId);
    if (!key) {
      return NextResponse.json(
        { error: 'INVALID_ID', message: MEMORY_ERROR_MESSAGES.INVALID_ID },
        { status: 400 }
      );
    }

    try {
      await getMemoryRepository().delete(key);
      return NextResponse.json({ deleted: true });
    } catch (error) {
      console.error('[DELETE /api/memory/:id] 記憶の削除に失敗しました', error);
      return NextResponse.json(
        { error: 'DELETE_FAILED', message: MEMORY_ERROR_MESSAGES.DELETE_FAILED },
        { status: 500 }
      );
    }
  }
);
