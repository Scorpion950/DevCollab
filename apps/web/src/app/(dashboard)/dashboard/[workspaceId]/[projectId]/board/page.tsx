'use client';

import { LayoutGrid, Zap } from 'lucide-react';

// Phase 2 placeholder — Kanban board will be implemented here
export default function BoardPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-12 animate-fade-in">
      <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6">
        <LayoutGrid size={32} className="text-primary" />
      </div>
      <h2 className="text-xl font-semibold text-text-primary mb-2">
        Kanban Board
      </h2>
      <p className="text-text-muted text-sm max-w-sm mb-6">
        The full Kanban board with drag-and-drop, real-time sync, and task
        management is coming in{' '}
        <span className="text-primary font-medium">Phase 2</span>.
      </p>
      <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-lg text-sm text-primary">
        <Zap size={14} />
        Phase 2 — In Progress
      </div>
    </div>
  );
}
