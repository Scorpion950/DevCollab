'use client';

import { Board } from '@/components/board/Board';
import { useParams } from 'next/navigation';

export default function BoardPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  const projectId = params.projectId as string;

  return (
    <div className="h-screen w-full">
      <Board projectId={projectId} workspaceId={workspaceId} />
    </div>
  );
}
