import React from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

interface Viewer {
  id: string;
  name: string;
  avatar?: string;
}

interface PresenceIndicatorProps {
  viewers: Viewer[];
}

export const PresenceIndicator: React.FC<PresenceIndicatorProps> = ({ viewers }) => {
  if (viewers.length === 0) return null;

  const displayViewers = viewers.slice(0, 3);
  const extraCount = Math.max(0, viewers.length - 3);

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {displayViewers.map((viewer) => (
          <Avatar key={viewer.id} className="w-8 h-8 border-2 border-background hover:z-10">
            <AvatarImage src={viewer.avatar || ''} />
            <AvatarFallback>{viewer.name.charAt(0)}</AvatarFallback>
          </Avatar>
        ))}
        {extraCount > 0 && (
          <div className="w-8 h-8 rounded-full bg-surface-elevated border-2 border-background flex items-center justify-center text-xs font-semibold text-text-secondary">
            +{extraCount}
          </div>
        )}
      </div>
      <span className="text-sm text-text-secondary">
        {viewers.length} {viewers.length === 1 ? 'viewing' : 'viewing'}
      </span>
    </div>
  );
};
