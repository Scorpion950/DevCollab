import React from 'react';
import { BoardTask, Priority } from '@/types';
import { useTaskStore } from '@/store/task.store';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { GripVertical, AlertCircle } from 'lucide-react';

interface TaskCardProps {
  task: BoardTask;
  projectId: string;
  workspaceId: string;
}

const priorityColors: Record<Priority, string> = {
  P0: 'bg-red-500 text-white',
  P1: 'bg-amber-500 text-white',
  P2: 'bg-cyan-500 text-white',
};

const priorityLabels: Record<Priority, string> = {
  P0: 'Critical',
  P1: 'High',
  P2: 'Normal',
};

export const TaskCard: React.FC<TaskCardProps> = ({ task }) => {
  const { setSelectedTaskId, openModal } = useTaskStore();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleClick = () => {
    setSelectedTaskId(task.id);
    openModal();
  };

  const getDaysUntilDue = () => {
    if (!task.dueDate) return null;
    const days = Math.ceil(
      (new Date(task.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    return days;
  };

  const daysUntilDue = getDaysUntilDue();
  const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
  const isDueSoon = daysUntilDue !== null && daysUntilDue <= 3 && daysUntilDue >= 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={handleClick}
      className={cn(
        'p-3 bg-surface-elevated rounded-lg border border-border hover:border-primary cursor-move transition-all group',
        isDragging && 'shadow-lg border-primary'
      )}
    >
      {/* Header with drag handle */}
      <div className="flex items-start gap-2 mb-2">
        <div
          {...attributes}
          {...listeners}
          className="mt-0.5 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <GripVertical className="w-4 h-4 text-text-muted" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-text-primary truncate">{task.title}</h3>
        </div>
      </div>

      {/* Labels */}
      {task.labels && task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.labels.slice(0, 2).map((label) => (
            <Badge key={label} variant="secondary" className="text-xs">
              {label}
            </Badge>
          ))}
          {task.labels.length > 2 && (
            <Badge variant="secondary" className="text-xs">
              +{task.labels.length - 2}
            </Badge>
          )}
        </div>
      )}

      {/* Priority and Due Date */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge className={cn('text-xs', priorityColors[task.priority])}>
            {priorityLabels[task.priority]}
          </Badge>
        </div>

        {/* Due Date */}
        {task.dueDate && (
          <div
            className={cn(
              'text-xs font-medium flex items-center gap-1',
              isOverdue && 'text-red-500',
              isOverdue && 'text-amber-500',
              !isOverdue && !isOverdue && 'text-text-muted'
            )}
          >
            {isOverdue && <AlertCircle className="w-3 h-3" />}
            {daysUntilDue === 0 && 'Due today'}
            {daysUntilDue === 1 && 'Due tomorrow'}
            {daysUntilDue! > 1 && `Due in ${daysUntilDue}d`}
            {daysUntilDue! < 0 && `Overdue ${Math.abs(daysUntilDue!)}d`}
          </div>
        )}
      </div>

      {/* Assignee Avatar */}
      {task.assignee && (
        <div className="mt-2 pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            <Avatar className="w-6 h-6">
              <AvatarImage src={task.assignee.avatar || ''} />
              <AvatarFallback>{task.assignee.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <span className="text-xs text-text-secondary truncate">{task.assignee.name}</span>
          </div>
        </div>
      )}
    </div>
  );
};
