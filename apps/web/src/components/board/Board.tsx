import React, { useEffect } from 'react';
import { TaskStatus } from '@/types';
import { Column } from './Column';
import { TaskDetailModal } from './TaskDetailModal';
import { CreateTaskModal } from './CreateTaskModal';
import { PresenceIndicator } from './PresenceIndicator';
import { useBoard } from '@/hooks/useBoard';
import { useBoardSocket } from '@/hooks/useBoardSocket';
import { usePresenceSocket } from '@/hooks/usePresenceSocket';
import { useBoardStore } from '@/store/board.store';
import { useTaskStore } from '@/store/task.store';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';

interface BoardProps {
  projectId: string;
  workspaceId: string;
}

export const Board: React.FC<BoardProps> = ({ projectId, workspaceId }) => {
  const { tasks, isLoading, error } = useBoard(projectId);
  const { selectedTaskId, setSelectedTaskId, openModal, closeModal, isModalOpen } = useTaskStore();
  const { tasks: boardTasks, setTasks, moveTask } = useBoardStore();
  const { viewers } = usePresenceSocket(projectId);
  const { moveTaskSocket } = useBoardSocket(projectId, workspaceId);
  const sensors = useSensors(useSensor(PointerSensor));

  useEffect(() => {
    if (tasks) {
      setTasks(tasks);
    }
  }, [tasks, setTasks]);

  const columns: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];

  const getTasksForStatus = (status: TaskStatus) => {
    return boardTasks.filter((task) => task.status === status).sort((a, b) => a.order - b.order);
  };

  const columnLabels: Record<TaskStatus, string> = {
    TODO: 'To Do',
    IN_PROGRESS: 'In Progress',
    IN_REVIEW: 'In Review',
    DONE: 'Done',
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  if (error) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading board</div>;
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold text-text-primary">Kanban Board</h1>
          <PresenceIndicator viewers={viewers} />
        </div>
        <Button onClick={() => openModal()} className="gap-2">
          <Plus className="w-4 h-4" />
          New Task
        </Button>
      </div>

      {/* Columns */}
      <DndContext
        sensors={sensors}
        onDragEnd={(event: DragEndEvent) => {
          const activeId = event.active.id as string;
          const overId = event.over?.id as string;
          const activeTask = boardTasks.find((task) => task.id === activeId);

          if (!activeTask || !overId) {
            return;
          }

          const destinationStatus =
            columns.includes(overId as TaskStatus)
              ? (overId as TaskStatus)
              : boardTasks.find((task) => task.id === overId)?.status;

          if (!destinationStatus || destinationStatus === activeTask.status) {
            return;
          }

          const destinationTasks = boardTasks.filter(
            (task) => task.status === destinationStatus
          );
          const newOrder = destinationTasks.length > 0
            ? Math.max(...destinationTasks.map((task) => task.order)) + 1
            : 0;

          moveTask(activeId, destinationStatus, newOrder);
          moveTaskSocket(activeId, destinationStatus, newOrder);
        }}
      >
        <div className="flex-1 overflow-x-auto p-6 gap-6 flex">
          {columns.map((status) => (
            <Column
              key={status}
              status={status}
              label={columnLabels[status]}
              tasks={getTasksForStatus(status)}
              projectId={projectId}
              workspaceId={workspaceId}
            />
          ))}
        </div>
      </DndContext>

      {/* Task Detail Modal */}
      {selectedTaskId && (
        <TaskDetailModal
          taskId={selectedTaskId}
          projectId={projectId}
          workspaceId={workspaceId}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
      {isModalOpen && !selectedTaskId && (
        <CreateTaskModal
          projectId={projectId}
          workspaceId={workspaceId}
          onClose={closeModal}
        />
      )}
    </div>
  );
};
