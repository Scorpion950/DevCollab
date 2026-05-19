import React, { useState } from 'react';
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

const statusColors: Record<TaskStatus, string> = {
  TODO: '#475569',
  IN_PROGRESS: '#7C3AED',
  IN_REVIEW: '#F59E0B',
  DONE: '#10B981',
};

export const Column: React.FC<ColumnProps> = ({ status, label, tasks, projectId, workspaceId }) => {
  const { setNodeRef } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className="flex-shrink-0 w-96 bg-surface rounded-lg border border-border overflow-hidden flex flex-col"
    >
      {/* Column Header */}
      <div
        className="px-4 py-3 border-b border-border flex items-center justify-between"
        style={{ borderLeftColor: statusColors[status], borderLeftWidth: '4px' }}
      >
        <h2 className="font-semibold text-text-primary">{label}</h2>
        <span className="text-xs px-2 py-1 bg-surface-elevated rounded text-text-secondary">
          {tasks.length}
        </span>
      </div>

      {/* Tasks */}
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {tasks.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-text-muted text-sm">
              No tasks
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
