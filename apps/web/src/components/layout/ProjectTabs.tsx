"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Kanban, List, Calendar, FileText, Code, Sparkles, Users } from "lucide-react";

export function ProjectTabs() {
  const pathname = usePathname();
  const params = useParams();
  const { workspaceId, projectId } = params;

  if (!workspaceId || !projectId) return null;

  const tabs = [
    { name: "Board", href: `/dashboard/${workspaceId}/${projectId}/board`, icon: Kanban },
    { name: "List", href: `/dashboard/${workspaceId}/${projectId}/list`, icon: List },
    { name: "Calendar", href: `/dashboard/${workspaceId}/${projectId}/calendar`, icon: Calendar },
    { name: "Docs", href: `/dashboard/${workspaceId}/${projectId}/docs`, icon: FileText },
    { name: "Snippets", href: `/dashboard/${workspaceId}/${projectId}/snippets`, icon: Code },
    { name: "AI Hub", href: `/dashboard/${workspaceId}/${projectId}/ai`, icon: Sparkles },
    { name: "Members", href: `/dashboard/${workspaceId}/${projectId}/members`, icon: Users },
  ];

  return (
    <div className="border-b border-border bg-bg-surface px-6 pt-3 flex gap-4">
      {tabs.map((tab) => {
        const isActive = pathname.includes(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.name}
            href={tab.href}
            className={cn(
              "flex items-center gap-2 px-1 pb-3 pt-1 border-b-2 text-sm font-medium transition-colors",
              isActive
                ? "border-primary text-primary-light"
                : "border-transparent text-text-secondary hover:text-text-primary hover:border-border-strong"
            )}
          >
            <Icon size={16} />
            {tab.name}
          </Link>
        );
      })}
    </div>
  );
}