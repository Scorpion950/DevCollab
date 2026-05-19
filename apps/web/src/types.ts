export type {
  ActivityLog,
  ApiError,
  ApiResponse,
  AuthUser,
  Notification,
  NotificationType,
  PaginatedResponse,
  Plan,
  Priority,
  Project,
  ProjectMember,
  ProjectWithDetails,
  Role,
  SocketEvents,
  Snippet,
  SnippetLanguage,
  Task,
  TaskAttachment,
  TaskComment,
  TaskStatus,
  TaskWithDetails,
  User,
  WikiPage,
  WikiVersion,
  Workspace,
  WorkspaceMember,
  WorkspaceWithMembers,
} from '@devcollab/types';

import type { Task, TaskWithDetails } from '@devcollab/types';

export type BoardTask = Task &
  Partial<
    Pick<TaskWithDetails, 'assignee' | 'reporter' | 'comments' | 'attachments'>
  >;

export type TaskUpdateInput = Partial<
  Omit<BoardTask, 'dueDate' | 'createdAt' | 'updatedAt'>
> & {
  dueDate?: string | Date | null;
};
