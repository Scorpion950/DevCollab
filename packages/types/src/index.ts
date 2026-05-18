// =============================================
// ENUMS
// =============================================

export type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
export type Priority = 'P0' | 'P1' | 'P2';
export type Plan = 'FREE' | 'PRO';
export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'TASK_MOVED'
  | 'COMMENT_MENTION'
  | 'DOC_UPDATED'
  | 'MEMBER_JOINED'
  | 'INVITE_ACCEPTED';

// =============================================
// USER
// =============================================

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  bio: string | null;
  skills: string[];
  githubUrl: string | null;
  plan: Plan;
  aiUsageToday: number;
  aiLastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthUser extends User {
  accessToken: string;
}

// =============================================
// WORKSPACE
// =============================================

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo: string | null;
  ownerId: string;
  plan: Plan;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  role: Role;
  joinedAt: string;
  user: Pick<User, 'id' | 'name' | 'email' | 'avatar'>;
}

export interface WorkspaceWithMembers extends Workspace {
  members: WorkspaceMember[];
  _count: { projects: number; members: number };
}

// =============================================
// PROJECT
// =============================================

export interface Project {
  id: string;
  name: string;
  description: string | null;
  color: string;
  emoji: string | null;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMember {
  projectId: string;
  userId: string;
  role: Role;
  user: Pick<User, 'id' | 'name' | 'email' | 'avatar'>;
}

export interface ProjectWithDetails extends Project {
  members: ProjectMember[];
  _count: { tasks: number; snippets: number; wikiPages: number };
}

// =============================================
// TASK
// =============================================

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  order: number;
  dueDate: string | null;
  labels: string[];
  projectId: string;
  assigneeId: string | null;
  reporterId: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskWithDetails extends Task {
  assignee: Pick<User, 'id' | 'name' | 'avatar'> | null;
  reporter: Pick<User, 'id' | 'name' | 'avatar'>;
  comments: TaskComment[];
  attachments: TaskAttachment[];
}

export interface TaskComment {
  id: string;
  taskId: string;
  content: string;
  mentions: string[];
  authorId: string;
  author: Pick<User, 'id' | 'name' | 'avatar'>;
  createdAt: string;
  updatedAt: string;
}

export interface TaskAttachment {
  id: string;
  taskId: string;
  url: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  uploadedById: string;
  createdAt: string;
}

// =============================================
// WIKI
// =============================================

export interface WikiPage {
  id: string;
  title: string;
  content: string;
  projectId: string;
  parentId: string | null;
  authorId: string;
  author: Pick<User, 'id' | 'name' | 'avatar'>;
  createdAt: string;
  updatedAt: string;
}

export interface WikiVersion {
  id: string;
  pageId: string;
  content: string;
  savedById: string;
  savedBy: Pick<User, 'id' | 'name' | 'avatar'>;
  createdAt: string;
}

// =============================================
// SNIPPET
// =============================================

export type SnippetLanguage =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'java'
  | 'cpp'
  | 'go'
  | 'rust'
  | 'html'
  | 'css'
  | 'sql'
  | 'bash'
  | 'json'
  | 'yaml'
  | 'other';

export interface Snippet {
  id: string;
  title: string;
  description: string | null;
  code: string;
  language: SnippetLanguage;
  tags: string[];
  projectId: string;
  authorId: string;
  author: Pick<User, 'id' | 'name' | 'avatar'>;
  createdAt: string;
  updatedAt: string;
}

// =============================================
// NOTIFICATIONS
// =============================================

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

// =============================================
// ACTIVITY
// =============================================

export interface ActivityLog {
  id: string;
  workspaceId: string;
  projectId: string | null;
  userId: string;
  user: Pick<User, 'id' | 'name' | 'avatar'>;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// =============================================
// API RESPONSES
// =============================================

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface ApiError {
  success: false;
  error: string;
  details?: Record<string, string[]>;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// =============================================
// SOCKET EVENTS
// =============================================

export interface SocketEvents {
  // Presence
  'presence:join': { projectId: string; user: Pick<User, 'id' | 'name' | 'avatar'> };
  'presence:leave': { projectId: string; userId: string };
  'presence:sync': { viewers: Pick<User, 'id' | 'name' | 'avatar'>[] };

  // Board
  'task:created': { task: Task };
  'task:updated': { task: Task };
  'task:moved': { taskId: string; status: TaskStatus; order: number };
  'task:deleted': { taskId: string };

  // Comments
  'comment:created': { comment: TaskComment };

  // Notifications
  'notification:new': { notification: Notification };

  // Activity
  'activity:new': { activity: ActivityLog };
}
