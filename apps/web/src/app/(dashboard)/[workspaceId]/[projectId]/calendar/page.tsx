"use client";

import { useBoard } from "@/hooks/useBoard";
import { useParams } from "next/navigation";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { useMemo } from "react";
import { enUS } from "date-fns/locale";

const locales = {
  "en-US": enUS,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

export default function CalendarPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { tasks, isLoading } = useBoard(projectId);

  const events = useMemo(() => {
    return tasks
      .filter((t) => t.dueDate)
      .map((t) => ({
        id: t.id,
        title: t.title,
        start: new Date(t.dueDate!),
        end: new Date(t.dueDate!),
        allDay: true,
      }));
  }, [tasks]);

  if (isLoading) return <div className="p-8">Loading calendar...</div>;

  return (
    <div className="flex-1 p-8 h-full flex flex-col">
      <h1 className="text-2xl font-bold mb-4">Calendar View</h1>
      <div className="flex-1 min-h-0 bg-surface border border-border p-4 rounded-xl">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: "100%" }}
          className="dark-calendar"
        />
      </div>
    </div>
  );
}