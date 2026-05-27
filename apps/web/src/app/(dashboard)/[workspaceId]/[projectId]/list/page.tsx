"use client";

import { useBoard } from "@/hooks/useBoard";
import { useParams } from "next/navigation";
import { format } from "date-fns";
import { useState } from "react";
import { TaskDetailModal } from "@/components/board/TaskDetailModal";

export default function ListPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const workspaceId = params.workspaceId as string;
  const { tasks, isLoading } = useBoard(projectId);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  if (isLoading) return <div className="p-8">Loading list...</div>;

  return (
    <div className="flex-1 p-8 h-full flex flex-col">
      <h1 className="text-2xl font-bold mb-4">List View</h1>
      <div className="flex-1 min-h-0 bg-surface border border-border rounded-xl  overflow-x-auto">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-bg-elevated">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                Title
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                Priority
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                Due Date
              </th>
            </tr>
          </thead>
          <tbody className="bg-bg-surface divide-y divide-border">
            {tasks.map((t) => (
              <tr 
                key={t.id} 
                className="hover:bg-bg-elevated transition-colors cursor-pointer"
                onClick={() => setSelectedTaskId(t.id)}
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm text-text-primary">
                  {t.title}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium 
                    ${
                      t.status === "TODO" ? "badge-gray" :
                      t.status === "IN_PROGRESS" ? "badge-violet" :
                      t.status === "IN_REVIEW" ? "badge-amber" :
                      "badge-green"
                    }`}
                  >
                    {t.status.replace("_", " ")}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium 
                    ${
                      t.priority === "P0" ? "badge-red" :
                      t.priority === "P1" ? "badge-amber" :
                      "badge-cyan"
                    }`}
                  >
                    {t.priority}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary">
                  {t.dueDate ? format(new Date(t.dueDate), "MMM dd, yyyy") : "-"}
                </td>
              </tr>
            ))}
            {tasks.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-text-muted">
                  No tasks found in this project.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {selectedTaskId && (
        <TaskDetailModal
          taskId={selectedTaskId}
          projectId={projectId}
          workspaceId={workspaceId}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </div>
  );
}