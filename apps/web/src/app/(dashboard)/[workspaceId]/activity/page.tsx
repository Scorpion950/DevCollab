'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ActivityFeed } from '@/components/activity/ActivityFeed';
import { Activity } from 'lucide-react';
import { api } from '@/lib/api';

interface ActivityLog {
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

export default function ActivityPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;

  const [activities, setActivities] = useState<Record<string, ActivityLog[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivities = async () => {
      try {
        const response = await api.get(
          `/activity?workspaceId=${workspaceId}&limit=50`
        );
        setActivities(response.data.activities);
      } catch (error) {
        console.error('Failed to fetch activity:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchActivities();
  }, [workspaceId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Activity className="text-violet-400" size={32} />
        <h1 className="text-3xl font-bold text-slate-100">Activity Feed</h1>
      </div>

      <ActivityFeed activities={activities} loading={loading} />
    </div>
  );
}
