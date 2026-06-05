import { useState, useCallback } from "react";
import { CalendarDays, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import Calendar, { type CalendarEvent } from "@/components/calendar/Calendar";
import { ChatView } from "@/components/chat/ChatView";

const VIEWS = [
  { id: "calendar", label: "日历", icon: CalendarDays },
  { id: "chat", label: "对话", icon: MessageCircle },
] as const;

type ViewId = (typeof VIEWS)[number]["id"];

const INITIAL_EVENTS: CalendarEvent[] = [
  { id: "1", date: "2026-06-04", title: "Penumbra 项目启动", time: "10:00" },
  { id: "2", date: "2026-06-04", title: "设计规范评审", time: "14:00", color: "#6b8f71" },
  { id: "3", date: "2026-06-10", title: "组件迁移开始", time: "09:30" },
  { id: "4", date: "2026-06-15", title: "聊天 UI 原型", color: "#d4924a" },
  { id: "5", date: "2026-06-05", title: "日历组件重构", time: "11:00" },
];

let nextId = 6;

export default function App() {
  const [activeView, setActiveView] = useState<ViewId>("calendar");
  const [events, setEvents] = useState<CalendarEvent[]>(INITIAL_EVENTS);
  const [selected, setSelected] = useState<Date | null>(null);

  const handleEventCreate = useCallback(
    (newEvent: Omit<CalendarEvent, "id">) => {
      setEvents((prev) => [...prev, { ...newEvent, id: String(nextId++) }]);
    },
    []
  );

  const handleEventDelete = useCallback((eventId: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
  }, []);

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: "linear-gradient(135deg, #fff8f3 0%, #ffeedd 50%, #fce4cc 100%)" }}>
      <header className="shrink-0 px-4 sm:px-6 pt-4 sm:pt-6 pb-0">
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground mb-3">Penumbra</h1>
        <nav className="flex gap-1">
          {VIEWS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveView(id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                activeView === id
                  ? "bg-white/60 text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/30"
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>
      </header>
      <main className="flex-1 flex flex-col min-h-0 w-full overflow-hidden relative">
        {activeView === "calendar" && (
          <div className="h-full p-4 sm:p-6 lg:p-8">
            <div className="max-w-[600px] mx-auto h-full flex flex-col">
              <Calendar
                events={events}
                selectedDate={selected ?? undefined}
                onDateSelect={setSelected}
                onEventCreate={handleEventCreate}
                onEventDelete={handleEventDelete}
                highlightToday
                weekStart={1}
                layout="compact"
                className="flex-1"
              />
            </div>
          </div>
        )}
        {activeView === "chat" && <ChatView />}
      </main>
    </div>
  );
}
