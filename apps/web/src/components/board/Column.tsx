import React from 'react';
import { BoardTask, TaskStatus } from '@/types';
import { TaskCard } from './TaskCard';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';

interface ColumnProps {
  status: TaskStatus;
  label: string;
  tasks: BoardTask[];
  projectId: string;
  workspaceId: string;
}

const COLUMN_CONFIG: Record<TaskStatus, { color: string; dot: string; bg: string; label: string }> = {
  TODO:        { color: '#475569', dot: 'bg-slate-500',  bg: 'bg-slate-500/5',  label: 'To Do' },
  IN_PROGRESS: { color: '#7C3AED', dot: 'bg-primary',    bg: 'bg-primary/5',   label: 'In Progress' },
  IN_REVIEW:   { color: '#F59E0B', dot: 'bg-warning',    bg: 'bg-warning/5',   label: 'In Review' },
  DONE:        { color: '#10B981', dot: 'bg-success',    bg: 'bg-success/5',   label: 'Done' },
};

export const Column: React.FC<ColumnProps> = ({ status, label, tasks, projectId, workspaceId }) => {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const config = COLUMN_CONFIG[status];

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-shrink-0 w-80 flex flex-col rounded-xl border transition-all duration-200',
        isOver
          ? 'border-primary/50 shadow-glow bg-primary/5'
          : 'border-border bg-bg-surface'
      )}
      style={{ maxHeight: 'calc(100vh - 200px)' }}
    >
      {/* Column Header */}
      <div
        className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0 rounded-t-xl"
        style={{ borderTopColor: config.color, borderTopWidth: '3px' }}
      >
        <div className="flex items-center gap-2">
          <span className={cn('w-2 h-2 rounded-full flex-shrink-0', config.dot)} />
          <h2 className="text-sm font-semibold text-text-primary">{label}</h2>
        </div>
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ backgroundColor: `${config.color}20`, color: config.color }}
        >
          {tasks.length}
        </span>
      </div>

      {/* Tasks */}
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-[80px]">
          {tasks.length === 0 ? (
            <div className={cn(
              'flex items-center justify-center h-24 rounded-lg border-2 border-dashed text-text-muted text-xs transition-colors',
              isOver ? 'border-primary/40 text-primary' : 'border-border'
            )}>
              {isOver ? 'Drop here' : 'No tasks'}
            </div>
          ) : (
            tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                projectId={projectId}
                workspaceId={workspaceId}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
};
