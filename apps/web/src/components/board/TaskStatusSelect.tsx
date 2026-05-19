import React from 'react';
import { BoardTask, TaskStatus } from '@/types';
import { useTask } from '@/hooks/useTask';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface TaskStatusSelectProps {
  task: BoardTask;
  projectId: string;
  workspaceId: string;
}

const statusLabels: Record<TaskStatus, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  IN_REVIEW: 'In Review',
  DONE: 'Done',
};

export const TaskStatusSelect: React.FC<TaskStatusSelectProps> = ({
  task,
  projectId,
  workspaceId,
}) => {
  const { updateTask } = useTask(task.id);

  const handleStatusChange = (newStatus: TaskStatus) => {
    updateTask({ status: newStatus });
  };

  return (
    <Select value={task.status} onValueChange={handleStatusChange}>
      <SelectTrigger className="bg-surface-elevated border-border">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(statusLabels).map(([value, label]) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
