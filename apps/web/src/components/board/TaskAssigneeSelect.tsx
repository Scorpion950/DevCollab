import React, { useState, useEffect } from 'react';
import { BoardTask } from '@/types';
import { useTask } from '@/hooks/useTask';
import { api } from '@/lib/api';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface TaskAssigneeSelectProps {
  task: BoardTask;
  projectId: string;
  workspaceId: string;
}

export const TaskAssigneeSelect: React.FC<TaskAssigneeSelectProps> = ({
  task,
  projectId,
  workspaceId,
}) => {
  const { updateTask } = useTask(task.id);
  const [members, setMembers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch project members
    const fetchMembers = async () => {
      try {
        const response = await api.get(
          `/workspaces/${workspaceId}/projects/${projectId}`
        );
        setMembers(response.data.data.members.map((member: any) => member.user));
      } catch (error) {
        console.error('Error fetching members:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMembers();
  }, [projectId, workspaceId]);

  const handleAssigneeChange = (userId: string) => {
    updateTask({ assigneeId: userId });
  };

  const handleRemoveAssignee = () => {
    updateTask({ assigneeId: null });
  };

  if (isLoading) {
    return <div className="text-sm text-text-muted">Loading...</div>;
  }

  return (
    <div className="flex items-center gap-2">
      {task.assignee ? (
        <>
          <div className="flex items-center gap-2 flex-1">
            <Avatar className="w-6 h-6">
              <AvatarImage src={task.assignee.avatar || ''} />
              <AvatarFallback>{task.assignee.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <span className="text-sm text-text-primary">{task.assignee.name}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRemoveAssignee}
            className="h-6 w-6 p-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </>
      ) : (
        <Select onValueChange={handleAssigneeChange}>
          <SelectTrigger className="bg-surface-elevated border-border">
            <SelectValue placeholder="Assign to..." />
          </SelectTrigger>
          <SelectContent>
            {members.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                <div className="flex items-center gap-2">
                  <Avatar className="w-5 h-5">
                    <AvatarImage src={member.avatar || ''} />
                    <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  {member.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
};
