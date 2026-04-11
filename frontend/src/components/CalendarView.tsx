import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ColumnData } from "./KanbanColumn";
import { CardData } from "./KanbanCard";

const COLUMN_COLORS: Record<string, string> = {
  backlog: "var(--col-backlog)",
  todo: "var(--col-todo)",
  progress: "var(--col-progress)",
  done: "var(--col-done)",
  blocked: "var(--col-blocked)",
};

const PRIORITY_DOTS: Record<string, string> = {
  critical: "bg-destructive",
  high: "bg-[hsl(var(--col-todo))]",
  medium: "bg-[hsl(var(--col-progress))]",
  low: "bg-[hsl(var(--col-done))]",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function parseDueToDate(dueDate?: string): Date | null {
  if (!dueDate) return null;
  const match = dueDate.match(/^(\w+)\s+(\d+)$/);
  if (!match) return null;
  const months: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const m = months[match[1]];
  if (m === undefined) return null;
  return new Date(2026, m, parseInt(match[2]));
}

interface CalendarViewProps {
  columns: ColumnData[];
}

export function CalendarView({ columns }: CalendarViewProps) {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(2); // March

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);
  const monthName = new Date(year, month).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const allCards = columns.flatMap(col =>
    col.cards.map(card => ({ ...card, columnId: col.id, columnTitle: col.title }))
  );

  const cardsByDay: Record<number, (CardData & { columnId: string; columnTitle: string })[]> = {};
  allCards.forEach(card => {
    const d = parseDueToDate(card.dueDate);
    if (d && d.getMonth() === month && d.getFullYear() === year) {
      const day = d.getDate();
      if (!cardsByDay[day]) cardsByDay[day] = [];
      cardsByDay[day].push(card);
    }
  });

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);
  while (cells.length % 7 !== 0) cells.push(null);

  const today = 10; // March 10

  return (
    <div className="flex-1 overflow-auto scrollbar-thin px-6 py-6">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-lg font-bold text-foreground font-mono-display tracking-wide">{monthName.toUpperCase()}</h2>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-3">
          {Object.entries(COLUMN_COLORS).map(([key, color]) => (
            <div key={key} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: `hsl(${color})` }} />
              <span className="text-[9px] font-mono-display text-muted-foreground uppercase">{key}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map(d => (
          <div key={d} className="text-center py-2">
            <span className="text-[10px] font-mono-display tracking-widest text-muted-foreground/60 uppercase">{d}</span>
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 border-t border-l border-border/30">
        {cells.map((day, idx) => {
          const cards = day ? cardsByDay[day] || [] : [];
          const isToday = day === today && month === 2 && year === 2026;
          const isWeekend = idx % 7 === 0 || idx % 7 === 6;

          return (
            <div
              key={idx}
              className={`min-h-[120px] border-r border-b border-border/30 p-2 transition-colors ${
                day === null ? "bg-muted/10" : isWeekend ? "bg-muted/5" : "hover:bg-muted/10"
              }`}
            >
              {day !== null && (
                <>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-xs font-mono-display font-bold ${
                      isToday ? "text-primary bg-primary/15 w-6 h-6 rounded-full flex items-center justify-center" : "text-muted-foreground"
                    }`}>
                      {day}
                    </span>
                    {cards.length > 0 && (
                      <span className="text-[9px] font-mono-display text-muted-foreground/50">{cards.length}</span>
                    )}
                  </div>
                  <div className="space-y-1">
                    {cards.slice(0, 3).map(card => {
                      const colColor = COLUMN_COLORS[card.columnId];
                      return (
                        <div
                          key={card.id}
                          className="group rounded-md px-1.5 py-1 cursor-pointer transition-all hover:scale-[1.02]"
                          style={{ backgroundColor: `hsl(${colColor} / 0.12)`, borderLeft: `2px solid hsl(${colColor})` }}
                        >
                          <div className="flex items-center gap-1">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOTS[card.priority]}`} />
                            <span className="text-[10px] text-foreground/80 truncate leading-tight">{card.title}</span>
                          </div>
                          {card.assignee && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <div
                                className="w-3 h-3 rounded-full flex items-center justify-center text-[7px] font-bold text-background"
                                style={{ backgroundColor: card.assignee.color }}
                              >
                                {card.assignee.name[0]}
                              </div>
                              <span className="text-[8px] text-muted-foreground">{card.assignee.name}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {cards.length > 3 && (
                      <span className="text-[9px] font-mono-display text-muted-foreground/50 pl-1">+{cards.length - 3} more</span>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}