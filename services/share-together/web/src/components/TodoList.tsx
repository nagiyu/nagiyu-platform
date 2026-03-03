'use client';

import { useEffect, useState } from 'react';
import { List, Paper, Snackbar, Stack, Typography } from '@mui/material';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TodoForm } from '@/components/TodoForm';
import { TodoItem } from '@/components/TodoItem';
import type { TodoResponse, TodosResponse } from '@/types';
import type { TodoItem as TodoItemType } from '@/types';

const MOCK_TODOS_BY_SCOPE: Record<
  'personal' | 'group',
  Record<string, Array<Pick<TodoItemType, 'todoId' | 'title' | 'isCompleted'>>>
> = {
  personal: {
    'mock-default-list': [
      {
        todoId: 'mock-personal-default-todo-1',
        title: '牛乳を買う',
        isCompleted: false,
      },
      {
        todoId: 'mock-personal-default-todo-2',
        title: '請求書を確認する',
        isCompleted: true,
      },
    ],
    'mock-work-list': [
      {
        todoId: 'mock-personal-work-todo-1',
        title: '週次レポートを作成する',
        isCompleted: false,
      },
      {
        todoId: 'mock-personal-work-todo-2',
        title: '顧客向け資料を更新する',
        isCompleted: true,
      },
    ],
    'mock-shopping-list': [
      {
        todoId: 'mock-personal-shopping-todo-1',
        title: '卵を買う',
        isCompleted: false,
      },
      {
        todoId: 'mock-personal-shopping-todo-2',
        title: 'トイレットペーパーを買う',
        isCompleted: true,
      },
    ],
  },
  group: {
    'mock-list-1': [
      {
        todoId: 'mock-group-1-todo-1',
        title: '会議用の議題を共有する',
        isCompleted: false,
      },
      {
        todoId: 'mock-group-1-todo-2',
        title: '懇親会の出欠を確認する',
        isCompleted: true,
      },
    ],
    'mock-list-2': [
      {
        todoId: 'mock-group-2-todo-1',
        title: 'パスポートの期限を確認する',
        isCompleted: false,
      },
      {
        todoId: 'mock-group-2-todo-2',
        title: 'ホテルの予約内容を共有する',
        isCompleted: true,
      },
    ],
    'mock-list-3': [
      {
        todoId: 'mock-group-3-todo-1',
        title: 'ゴミ出し当番を確認する',
        isCompleted: false,
      },
      {
        todoId: 'mock-group-3-todo-2',
        title: '消耗品の購入担当を決める',
        isCompleted: true,
      },
    ],
    'mock-list-4': [
      {
        todoId: 'mock-group-4-todo-1',
        title: 'スプリント計画を立てる',
        isCompleted: false,
      },
      {
        todoId: 'mock-group-4-todo-2',
        title: '先週のタスクを振り返る',
        isCompleted: true,
      },
    ],
    'mock-list-5': [
      {
        todoId: 'mock-group-5-todo-1',
        title: '新機能のアイデアを投稿する',
        isCompleted: false,
      },
      {
        todoId: 'mock-group-5-todo-2',
        title: 'ユーザーフィードバックをまとめる',
        isCompleted: false,
      },
    ],
  },
};

const DEFAULT_LIST_ID_BY_SCOPE: Record<'personal' | 'group', string> = {
  personal: 'mock-default-list',
  group: 'mock-list-1',
};

const ERROR_MESSAGES = {
  TODOS_FETCH_FAILED: 'ToDo 一覧取得 API の実行に失敗しました',
  TODO_CREATE_FAILED: 'ToDo 作成 API の実行に失敗しました',
  TODO_UPDATE_FAILED: 'ToDo 更新 API の実行に失敗しました',
  TODO_DELETE_FAILED: 'ToDo 削除 API の実行に失敗しました',
  TODOS_FETCH_FAILED_NOTICE: 'ToDo一覧の取得に失敗しました。',
} as const;

type TodoListProps = {
  scope?: 'personal' | 'group';
  listId?: string;
  apiEnabled?: boolean;
};

function toDisplayTodo(todo: TodoItemType): Pick<TodoItemType, 'todoId' | 'title' | 'isCompleted'> {
  return {
    todoId: todo.todoId,
    title: todo.title,
    isCompleted: todo.isCompleted,
  };
}

function createTodosApiPath(listId: string, todoId?: string): string {
  const encodedListId = encodeURIComponent(listId);
  if (!todoId) {
    return `/api/lists/${encodedListId}/todos`;
  }

  return `/api/lists/${encodedListId}/todos/${encodeURIComponent(todoId)}`;
}

export function TodoList({ scope = 'personal', listId, apiEnabled = false }: TodoListProps) {
  const todosByList = MOCK_TODOS_BY_SCOPE[scope];
  const fallbackListId = DEFAULT_LIST_ID_BY_SCOPE[scope];
  const isApiMode = apiEnabled && scope === 'personal' && Boolean(listId);
  const [todos, setTodos] = useState(
    () => todosByList[listId ?? fallbackListId] ?? todosByList[fallbackListId] ?? []
  );
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isApiMode || !listId) {
      return;
    }

    void globalThis
      .fetch(createTodosApiPath(listId))
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`status: ${response.status}`);
        }
        const result = (await response.json()) as TodosResponse;
        setTodos(result.data.todos.map(toDisplayTodo));
      })
      .catch((error: unknown) => {
        console.error(ERROR_MESSAGES.TODOS_FETCH_FAILED, { error, listId });
        setSnackbarMessage(ERROR_MESSAGES.TODOS_FETCH_FAILED_NOTICE);
      });
  }, [isApiMode, listId]);

  const handleToggleComplete = (todoId: string) => {
    if (isApiMode && listId) {
      const targetTodo = todos.find((todo) => todo.todoId === todoId);
      if (!targetTodo) {
        return;
      }

      const nextCompleted = !targetTodo.isCompleted;
      void globalThis
        .fetch(createTodosApiPath(listId, todoId), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isCompleted: nextCompleted }),
        })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`status: ${response.status}`);
          }
          const result = (await response.json()) as TodoResponse;
          setTodos((prev) =>
            prev.map((todo) => (todo.todoId === todoId ? toDisplayTodo(result.data) : todo))
          );
        })
        .catch((error: unknown) => {
          console.error(ERROR_MESSAGES.TODO_UPDATE_FAILED, { error, listId, todoId });
        });
      return;
    }

    setTodos((prev) =>
      prev.map((todo) =>
        todo.todoId === todoId ? { ...todo, isCompleted: !todo.isCompleted } : todo
      )
    );
  };

  const handleDeleteRequest = (todoId: string) => {
    setPendingDeleteId(todoId);
  };

  const handleDeleteConfirm = () => {
    if (pendingDeleteId) {
      if (isApiMode && listId) {
        const deleteTargetId = pendingDeleteId;
        const deleteTargetIndex = todos.findIndex((todo) => todo.todoId === deleteTargetId);
        const deletedTodo = deleteTargetIndex >= 0 ? todos[deleteTargetIndex] : null;
        setTodos((prev) => prev.filter((todo) => todo.todoId !== deleteTargetId));
        setPendingDeleteId(null);
        void globalThis
          .fetch(createTodosApiPath(listId, deleteTargetId), {
            method: 'DELETE',
          })
          .then((response) => {
            if (!response.ok) {
              throw new Error(`status: ${response.status}`);
            }
            setSnackbarMessage('ToDoを削除しました。');
          })
          .catch((error: unknown) => {
            console.error(ERROR_MESSAGES.TODO_DELETE_FAILED, {
              error,
              listId,
              todoId: deleteTargetId,
            });
            if (deletedTodo) {
              setTodos((prev) => {
                if (prev.some((todo) => todo.todoId === deletedTodo.todoId)) {
                  return prev;
                }
                const nextTodos = [...prev];
                nextTodos.splice(Math.min(deleteTargetIndex, nextTodos.length), 0, deletedTodo);
                return nextTodos;
              });
            }
          });
        return;
      }

      setTodos((prev) => prev.filter((todo) => todo.todoId !== pendingDeleteId));
      setSnackbarMessage('ToDoを削除しました。');
      setPendingDeleteId(null);
    }
  };

  const handleDeleteCancel = () => {
    setPendingDeleteId(null);
  };

  const handleAdd = (title: string) => {
    if (isApiMode && listId) {
      void globalThis
        .fetch(createTodosApiPath(listId), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`status: ${response.status}`);
          }
          const result = (await response.json()) as TodoResponse;
          setTodos((prev) => [...prev, toDisplayTodo(result.data)]);
          setSnackbarMessage('ToDoを追加しました。');
        })
        .catch((error: unknown) => {
          console.error(ERROR_MESSAGES.TODO_CREATE_FAILED, { error, listId });
        });
      return;
    }

    const newTodo = {
      todoId: crypto.randomUUID(),
      title,
      isCompleted: false,
    };
    setTodos((prev) => [...prev, newTodo]);
    setSnackbarMessage('ToDoを追加しました。');
  };

  return (
    <Paper sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h6" component="h2">
          ToDo
        </Typography>
        <TodoForm onAdd={handleAdd} />
        <List disablePadding>
          {todos.map((todo) => (
            <TodoItem
              key={todo.todoId}
              todo={todo}
              onToggleComplete={handleToggleComplete}
              onDelete={handleDeleteRequest}
            />
          ))}
        </List>
      </Stack>
      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="ToDoを削除"
        description="このToDoを削除しますか？"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
      <Snackbar
        open={snackbarMessage !== null}
        autoHideDuration={3000}
        onClose={() => setSnackbarMessage(null)}
        message={snackbarMessage}
      />
    </Paper>
  );
}
