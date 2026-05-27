import { ProjectTabs } from "@/components/layout/ProjectTabs";

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col w-full h-full overflow-hidden">
      <ProjectTabs />
      <div className="flex-1 w-full h-full overflow-hidden">
        {children}
      </div>
    </div>
  );
}