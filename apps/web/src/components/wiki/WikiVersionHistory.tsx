'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';

interface WikiVersion {
  id: string;
  createdAt: string;
  author: {
    id: string;
    name: string;
  };
}

interface WikiVersionHistoryProps {
  pageId: string;
  versions: WikiVersion[];
  onRestore: (versionId: string) => void;
  onViewDiff: (versionId: string) => void;
  currentVersionId?: string;
}

export function WikiVersionHistory({
  pageId,
  versions,
  onRestore,
  onViewDiff,
  currentVersionId,
}: WikiVersionHistoryProps) {
  return (
    <div className="bg-slate-900 rounded-lg p-4 space-y-4">
      <h3 className="font-semibold text-slate-100">Version History</h3>

      {versions.length === 0 ? (
        <p className="text-sm text-slate-500">No versions</p>
      ) : (
        <div className="space-y-2">
          {versions.map((version, idx) => (
            <div
              key={version.id}
              className={`p-3 border rounded-lg ${
                currentVersionId === version.id
                  ? 'border-violet-500 bg-violet-500/10'
                  : 'border-slate-700 bg-slate-800'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="text-sm font-medium text-slate-100">
                    Version {versions.length - idx}
                  </p>
                  <p className="text-xs text-slate-400">
                    {version.author.name} •{' '}
                    {formatDistanceToNow(new Date(version.createdAt), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {currentVersionId !== version.id && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onViewDiff(version.id)}
                  >
                    Compare
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onRestore(version.id)}
                  disabled={currentVersionId === version.id}
                >
                  Restore
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
