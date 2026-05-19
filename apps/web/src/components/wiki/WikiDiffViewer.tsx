'use client';

import { useEffect, useState } from 'react';

interface WikiDiffViewerProps {
  currentContent: string;
  previousContent: string;
}

export function WikiDiffViewer({
  currentContent,
  previousContent,
}: WikiDiffViewerProps) {
  const [showDiff, setShowDiff] = useState(true);

  // Simple line-by-line diff
  const currentLines = currentContent.split('\n');
  const previousLines = previousContent.split('\n');

  return (
    <div className="bg-slate-900 rounded-lg p-4 space-y-4">
      <h3 className="font-semibold text-slate-100">Changes</h3>

      <div className="grid grid-cols-2 gap-4">
        {/* Previous version */}
        <div>
          <p className="text-sm font-medium text-slate-300 mb-2">Previous Version</p>
          <div className="bg-slate-800 rounded p-3 max-h-96 overflow-auto text-xs font-mono text-slate-300 space-y-1">
            {previousLines.map((line, idx) => (
              <div key={idx} className="line-through text-slate-500">
                {line || <span className="text-slate-600">(empty line)</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Current version */}
        <div>
          <p className="text-sm font-medium text-slate-300 mb-2">Current Version</p>
          <div className="bg-slate-800 rounded p-3 max-h-96 overflow-auto text-xs font-mono text-slate-300 space-y-1">
            {currentLines.map((line, idx) => (
              <div key={idx} className="text-emerald-300">
                {line || <span className="text-slate-600">(empty line)</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
