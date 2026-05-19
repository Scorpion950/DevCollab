'use client';

import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { FileText, CheckCircle, Edit, MessageSquare, Plus, Trash2 } from 'lucide-react';

interface Activity {
  id: string;
  action: string;
  entityType: string;
  entityName?: string;
  entityId: string;
  user: {
    id: string;
    name: string;
    avatar?: string;
  };
  project?: {
    id: string;
    name: string;
  };
  createdAt: string;
  metadata?: Record<string, any>;
}

interface ActivityFeedProps {
  activities: Record<string, Activity[]>;
  loading?: boolean;
}

const ACTION_ICONS: Record<string, any> = {
  created: Plus,
  updated: Edit,
  deleted: Trash2,
  moved: CheckCircle,
  commented: MessageSquare,
};

const ACTION_COLORS: Record<string, string> = {
  created: 'bg-emerald-500/20 text-emerald-300',
  updated: 'bg-blue-500/20 text-blue-300',
  deleted: 'bg-red-500/20 text-red-300',
  moved: 'bg-purple-500/20 text-purple-300',
  commented: 'bg-cyan-500/20 text-cyan-300',
};

const ENTITY_ICONS: Record<string, any> = {
  task: CheckCircle,
  wiki_page: FileText,
  snippet: FileText,
  project: Plus,
};

export function ActivityFeed({ activities, loading }: ActivityFeedProps) {
  if (loading) {
    return <div className="text-center text-slate-400">Loading activity...</div>;
  }

  if (Object.keys(activities).length === 0) {
    return (
      <div className="text-center text-slate-400 py-8">
        No activities yet
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {Object.entries(activities).map(([date, dayActivities]) => (
        <div key={date}>
          <h3 className="font-semibold text-slate-300 mb-3">{date}</h3>
          <div className="space-y-2">
            {dayActivities.map((activity) => {
              const ActionIcon = ACTION_ICONS[activity.action] || Edit;
              const EntityIcon = ENTITY_ICONS[activity.entityType] || FileText;

              return (
                <div
                  key={activity.id}
                  className="bg-slate-800 rounded-lg p-4 border border-slate-700 hover:border-slate-600 transition-colors"
                >
                  <div className="flex gap-3 items-start">
                    <div
                      className={`p-2 rounded-lg ${
                        ACTION_COLORS[activity.action] || 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      <ActionIcon size={18} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-100">
                        <span className="font-medium">{activity.user.name}</span>
                        {' '}{activity.action === 'created' && 'created'}
                        {activity.action === 'updated' && 'updated'}
                        {activity.action === 'deleted' && 'deleted'}
                        {activity.action === 'moved' && 'moved'}
                        {activity.action === 'commented' && 'commented on'}{' '}
                        <span className="text-violet-400">
                          {activity.entityType.replace('_', ' ')}
                        </span>
                        {activity.entityName && (
                          <>
                            {' '}
                            <span className="font-semibold text-slate-200">
                              {activity.entityName}
                            </span>
                          </>
                        )}
                      </p>
                      {activity.project && (
                        <p className="text-xs text-slate-400 mt-1">
                          in <span className="font-medium">{activity.project.name}</span>
                        </p>
                      )}
                      <p className="text-xs text-slate-500 mt-2">
                        {formatDistanceToNow(new Date(activity.createdAt), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>

                    <EntityIcon size={18} className="text-slate-500 flex-shrink-0 mt-1" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
