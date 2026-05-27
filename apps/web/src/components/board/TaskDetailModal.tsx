import React, { useState, useEffect } from 'react';
import { useTask } from '@/hooks/useTask';
import { usePresenceSocket } from '@/hooks/usePresenceSocket';
import { TaskComments } from './TaskComments';
import { TaskAssigneeSelect } from './TaskAssigneeSelect';
import { TaskPrioritySelect } from './TaskPrioritySelect';
import { TaskStatusSelect } from './TaskStatusSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { Calendar, Users, AlertCircle } from 'lucide-react';

interface TaskDetailModalProps {
  taskId: string;
  projectId: string;
  workspaceId: string;
  onClose: () => void;
}

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  taskId,
  projectId,
  workspaceId,
  onClose,
}) => {
  const { task, isLoading, updateTask } = useTask(taskId);
  const { updateViewingTask } = usePresenceSocket(projectId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
    }
  }, [task]);

  useEffect(() => {
    updateViewingTask(taskId);
    return () => {
      updateViewingTask(undefined);
    };
  }, [taskId, updateViewingTask]);

  const handleSave = async () => {
    if (!task) return;

    setIsSaving(true);
    try {
      await updateTask({
        title,
        description,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <div className="flex items-center justify-center h-96">Loading...</div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!task) {
    return null;
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Task Details</DialogTitle>
          <DialogClose />
        </DialogHeader>

        <div className="space-y-6">
          {/* Title */}
          <div>
            <label className="text-sm font-medium text-text-primary mb-2 block">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-surface-elevated border-border"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium text-text-primary mb-2 block">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-surface-elevated border-border min-h-32"
              placeholder="Add task description..."
            />
          </div>

          {/* Status, Priority, Assignee */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-text-primary mb-2 block">Status</label>
              <TaskStatusSelect task={task} projectId={projectId} workspaceId={workspaceId} />
            </div>
            <div>
              <label className="text-sm font-medium text-text-primary mb-2 block">Priority</label>
              <TaskPrioritySelect task={task} projectId={projectId} workspaceId={workspaceId} />
            </div>
            <div>
              <label className="text-sm font-medium text-text-primary mb-2 block">Assignee</label>
              <TaskAssigneeSelect task={task} projectId={projectId} workspaceId={workspaceId} />
            </div>
          </div>

          {/* Due Date */}
          <div>
            <label className="text-sm font-medium text-text-primary mb-2 block flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Due Date
            </label>
            <Input
              type="date"
              value={task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : ''}
              onChange={(e) =>
                updateTask({
                  dueDate: e.target.value ? new Date(e.target.value) : null,
                })
              }
              className="bg-surface-elevated border-border"
            />
          </div>

          {/* Comments */}
          <div>
            <label className="text-sm font-medium text-text-primary mb-2 block flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Comments
            </label>
            <TaskComments
              taskId={taskId}
              projectId={projectId}
              workspaceId={workspaceId}
            />
          </div>

          {/* Save Button */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
