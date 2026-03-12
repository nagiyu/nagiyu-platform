'use client';

import { useEffect, useState } from 'react';
import { List, Paper, Snackbar, Stack, Typography } from '@mui/material';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TodoForm } from '@/components/TodoForm';
import { TodoItem } from '@/components/TodoItem';
import type { TodoResponse, TodosResponse } from '@/types';
import type { TodoItem as TodoItemType } from '@/types';

const ERROR_MESSAGES = {
  TODOS_FETCH_FAILED: 'ToDo 一覧取得 API の実行に失敗しました',
  TODO_CREATE_FAILED: 'ToDo 作成 API の実行に失敗しました',
  TODO_UPDATE_FAILED: 'ToDo 更新 API の実行に失敗しました',
  TODO_DELETE_FAILED: 'ToDo 削除 API の実行に失敗しました',
  TODOS_FETCH_FAILED_NOTICE: 'ToDo一覧の取得に失敗しました。',
  GROUP_ID_REQUIRED: 'グループIDが必要です',
} as const;

type TodoListProps = {
  scope?: 'personal' | 'group';
  listId?: string;
  groupId?: string;
};

function toDisplayTodo(todo: TodoItemType): Pick<TodoItemType, 'todoId' | 'title' | 'isCompleted'> {
  return {
    todoId: todo.todoId,
    title: todo.title,
    isCompleted: todo.isCompleted,
  };
}

function createTodosApiPath(
  scope: 'personal' | 'group',
  listId: string,
  groupId?: string,
  todoId?: string
) {
  const encodedListId = encodeURIComponent(listId);
  if (scope === 'group') {
    if (!groupId) {
      throw new Error(ERROR_MESSAGES.GROUP_ID_REQUIRED);
    }
    const encodedGroupId = encodeURIComponent(groupId);
    if (!todoId) {
      return `/api/groups/${encodedGroupId}/lists/${encodedListId}/todos`;
    }
    return `/api/groups/${encodedGroupId}/lists/${encodedListId}/todos/${encodeURIComponent(todoId)}`;
  }

  if (!todoId) {
    return `/api/lists/${encodedListId}/todos`;
  }

  return `/api/lists/${encodedListId}/todos/${encodeURIComponent(todoId)}`;
}

export function TodoList({ scope = 'personal', listId, groupId }: TodoListProps) {
  const [todos, setTodos] = useState<Array<Pick<TodoItemType, 'todoId' | 'title' | 'isCompleted'>>>(
    []
  );
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  const fetchTodos = (targetListId: string) => {
    void globalThis
      .fetch(createTodosApiPath(scope, targetListId, groupId))
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`status: ${response.status}`);
        }
        const result = (await response.json()) as TodosResponse;
        setTodos(result.data.todos.map(toDisplayTodo));
      })
      .catch((error: unknown) => {
        console.error(ERROR_MESSAGES.TODOS_FETCH_FAILED, { error, listId: targetListId });
        setSnackbarMessage(ERROR_MESSAGES.TODOS_FETCH_FAILED_NOTICE);
      });
  };

  useEffect(() => {
    if (!listId) {
      return;
    }
    if (scope === 'group' && !groupId) {
      return;
    }

    fetchTodos(listId);
  }, [groupId, listId, scope]);

  const handleToggleComplete = (todoId: string) => {
    if (!listId || (scope === 'group' && !groupId)) {
      return;
    }

    const targetTodo = todos.find((todo) => todo.todoId === todoId);
    if (!targetTodo) {
      return;
    }

    const nextCompleted = !targetTodo.isCompleted;
    void globalThis
      .fetch(createTodosApiPath(scope, listId, groupId, todoId), {
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
  };

  const handleDeleteRequest = (todoId: string) => {
    setPendingDeleteId(todoId);
  };

  const handleUpdate = (todoId: string, title: string) => {
    if (!listId || (scope === 'group' && !groupId)) {
      return;
    }

    void globalThis
      .fetch(createTodosApiPath(scope, listId, groupId, todoId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`status: ${response.status}`);
        }
        const result = (await response.json()) as TodoResponse;
        setTodos((prev) =>
          prev.map((todo) => (todo.todoId === todoId ? toDisplayTodo(result.data) : todo))
        );
        setSnackbarMessage('ToDoを更新しました。');
      })
      .catch((error: unknown) => {
        console.error(ERROR_MESSAGES.TODO_UPDATE_FAILED, { error, listId, todoId });
      });
  };

  const handleDeleteConfirm = () => {
    if (!pendingDeleteId || !listId || (scope === 'group' && !groupId)) {
      return;
    }

    const deleteTargetId = pendingDeleteId;
    void globalThis
      .fetch(createTodosApiPath(scope, listId, groupId, deleteTargetId), {
        method: 'DELETE',
      })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`status: ${response.status}`);
        }
        setTodos((prev) => prev.filter((todo) => todo.todoId !== deleteTargetId));
        fetchTodos(listId);
        setSnackbarMessage('ToDoを削除しました。');
      })
      .catch((error: unknown) => {
        console.error(ERROR_MESSAGES.TODO_DELETE_FAILED, {
          error,
          listId,
          todoId: deleteTargetId,
        });
      })
      .finally(() => {
        setPendingDeleteId(null);
      });
  };

  const handleDeleteCancel = () => {
    setPendingDeleteId(null);
  };

  const handleAdd = (title: string) => {
    if (!listId || (scope === 'group' && !groupId)) {
      return;
    }

    void globalThis
      .fetch(createTodosApiPath(scope, listId, groupId), {
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
              onUpdate={handleUpdate}
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
