import React from 'react';
import { BoardTask, Priority } from '@/types';
import { useTask } from '@/hooks/useTask';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface TaskPrioritySelectProps {
  task: BoardTask;
  projectId: string;
  workspaceId: string;
}

const priorityLabels: Record<Priority, string> = {
  P0: 'Critical',
  P1: 'High',
  P2: 'Normal',
};

const priorityColors: Record<Priority, string> = {
  P0: 'bg-red-500 text-white',
  P1: 'bg-amber-500 text-white',
  P2: 'bg-cyan-500 text-white',
};

export const TaskPrioritySelect: React.FC<TaskPrioritySelectProps> = ({
  task,
  projectId,
  workspaceId,
}) => {
  const { updateTask } = useTask(task.id);

  const handlePriorityChange = (newPriority: Priority) => {
    updateTask({ priority: newPriority });
  };

  return (
    <Select value={task.priority} onValueChange={handlePriorityChange}>
      <SelectTrigger className="bg-surface-elevated border-border">
        <Badge className={priorityColors[task.priority]}>
          {priorityLabels[task.priority]}
        </Badge>
      </SelectTrigger>
      <SelectContent>
        {Object.entries(priorityLabels).map(([value, label]) => (
          <SelectItem key={value} value={value}>
            <Badge className={priorityColors[value as Priority]}>{label}</Badge>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
