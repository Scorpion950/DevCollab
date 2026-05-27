import React, { useState, useEffect } from 'react';
import { Priority } from '@/types';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { useBoardStore } from '@/store/board.store';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CreateTaskModalProps {
  projectId: string;
  workspaceId: string;
  onClose: () => void;
}

const priorityOptions: { value: Priority; label: string }[] = [
  { value: 'P2', label: 'Normal' },
  { value: 'P1', label: 'High' },
  { value: 'P0', label: 'Critical' },
];

export const CreateTaskModal: React.FC<CreateTaskModalProps> = ({
  projectId,
  workspaceId,
  onClose,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('P2');
  // Radix Select.Item forbids empty string values — use sentinel 'unassigned'
  const [assigneeId, setAssigneeId] = useState<string>('unassigned');
  const [labels, setLabels] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [members, setMembers] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);
  const { addTask } = useBoardStore();
  const queryClient = useQueryClient();

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const response = await api.get(
          `/workspaces/${workspaceId}/projects/${projectId}`
        );
        setMembers(response.data.data.members.map((member: any) => member.user));
      } catch (error) {
        console.error('Error fetching members:', error);
      } finally {
        setIsLoadingMembers(false);
      }
    };

    if (projectId) {
      fetchMembers();
    }
  }, [projectId, workspaceId]);

  const handleCreateTask = async () => {
    if (!title.trim()) return;
    setIsSaving(true);

    try {
      const labelsArray = labels
        .split(',')
        .map((label) => label.trim())
        .filter(Boolean);

      const response = await api.post('/tasks', {
        projectId,
        title,
        description,
        priority,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        labels: labelsArray,
        assigneeId: assigneeId === 'unassigned' ? null : assigneeId,
        workspaceId,
      });

      addTask(response.data);
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
      onClose();
    } catch (error) {
      console.error('Error creating task:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
          <DialogClose />
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div>
            <label className="text-sm font-medium text-text-primary mb-2 block">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className=""
              placeholder="Task title"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-text-primary mb-2 block">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className=""
              placeholder="Task description"
              rows={4}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-text-primary mb-2 block">Priority</label>
              <Select value={priority} onValueChange={(value) => setPriority(value as Priority)}>
                <SelectTrigger className="bg-bg-elevated border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priorityOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-text-primary mb-2 block">Assignee</label>
              <Select
                value={assigneeId}
                onValueChange={(value) => setAssigneeId(value)}
              >
                <SelectTrigger className="bg-bg-elevated border-border">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {members.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-text-primary mb-2 block">Due Date</label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className=""
              />
            </div>
            <div>
              <label className="text-sm font-medium text-text-primary mb-2 block">Labels</label>
              <Input
                value={labels}
                onChange={(e) => setLabels(e.target.value)}
                className=""
                placeholder="comma-separated tags"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleCreateTask} disabled={isSaving || !title.trim()}>
              {isSaving ? 'Creating...' : 'Create Task'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
