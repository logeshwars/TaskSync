import { ColumnData } from "./KanbanColumn";
import { CardData } from "./KanbanCard";

const COLUMN_COLORS: Record<string, string> = {
  backlog: "var(--col-backlog)",
  todo: "var(--col-todo)",
  progress: "var(--col-progress)",
  done: "var(--col-done)",
  blocked: "var(--col-blocked)",
};

const DAYS = Array.from({ length: 15 }, (_, i) => {
  const d = new Date(2026, 2, i + 1); // March 1-15
  return {
    num: i + 1,
    day: d.toLocaleDateString("en-US", { weekday: "short" }),
    isWeekend: d.getDay() === 0 || d.getDay() === 6,
    date: d,
  };
});

function parseDueDay(dueDate?: string): number | null {
  if (!dueDate) return null;
  const match = dueDate.match(/Mar\s+(\d+)/);
  return match ? parseInt(match[1]) : null;
}

function getBarSpan(card: CardData): { start: number; end: number } | null {
  const due = parseDueDay(card.dueDate);
  if (!due) return null;
  const duration = card.priority === "critical" ? 3 : card.priority === "high" ? 4 : 5;
  const start = Math.max(1, due - duration + 1);
  return { start, end: due };
}

interface TimelineViewProps {
  columns: ColumnData[];
}

export function TimelineView({ columns }: TimelineViewProps) {
  const allCards = columns.flatMap(col =>
    col.cards.map(card => ({ ...card, columnId: col.id, columnTitle: col.title }))
  );

  const cardsWithDates = allCards.filter(c => parseDueDay(c.dueDate) !== null);
  const cardsWithoutDates = allCards.filter(c => parseDueDay(c.dueDate) === null);

  return (
    <div className="flex-1 overflow-auto scrollbar-thin px-6 py-6">
      <div className="min-w-[900px]">
        {/* Header */}
        <div className="flex items-end mb-1">
          <div className="w-64 shrink-0 pr-4">
            <span className="text-[10px] font-mono-display tracking-widest text-muted-foreground uppercase">Task</span>
          </div>
          <div className="flex-1 grid grid-cols-15 gap-0">
            {DAYS.map(d => (
              <div
                key={d.num}
                className={`text-center px-1 py-2 border-l border-border/30 ${d.isWeekend ? "bg-muted/30" : ""} ${d.num === new Date().getDate() && new Date().getMonth() === 2 ? "bg-primary/10" : ""}`}
              >
                <div className="text-[9px] font-mono-display text-muted-foreground/60 uppercase">{d.day}</div>
                <div className="text-xs font-mono-display text-muted-foreground font-bold">{d.num}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Today marker label */}
        <div className="flex items-center mb-3">
          <div className="w-64 shrink-0" />
          <div className="flex-1 grid grid-cols-15 gap-0">
            {DAYS.map(d => (
              <div key={d.num} className="relative">
                {d.num === 10 && (
                  <div className="absolute left-1/2 -translate-x-1/2 -top-1">
                    <span className="text-[8px] font-mono-display text-primary bg-primary/15 px-1.5 py-0.5 rounded-full">TODAY</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Rows with dates */}
        {cardsWithDates.map(card => {
          const bar = getBarSpan(card);
          if (!bar) return null;
          const colColor = COLUMN_COLORS[card.columnId] || "var(--col-backlog)";

          return (
            <div key={card.id} className="flex items-center group hover:bg-muted/20 rounded-lg transition-colors">
              <div className="w-64 shrink-0 pr-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: `hsl(${colColor})` }}
                  />
                  <span className="text-sm text-foreground truncate">{card.title}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 ml-4">
                  <span className="text-[10px] font-mono-display text-muted-foreground/60 uppercase">{card.columnTitle}</span>
                  {card.assignee && (
                    <div
                      className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-background"
                      style={{ backgroundColor: card.assignee.color }}
                    >
                      {card.assignee.name[0]}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-1 grid grid-cols-15 gap-0 py-2.5">
                {DAYS.map(d => {
                  const isInBar = d.num >= bar.start && d.num <= bar.end;
                  const isStart = d.num === bar.start;
                  const isEnd = d.num === bar.end;
                  const isToday = d.num === 10;

                  return (
                    <div
                      key={d.num}
                      className={`h-8 border-l border-border/10 relative ${d.isWeekend ? "bg-muted/10" : ""}`}
                    >
                      {isToday && (
                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-primary/40 z-10" />
                      )}
                      {isInBar && (
                        <div
                          className="absolute top-1 bottom-1 transition-all"
                          style={{
                            left: isStart ? "4px" : 0,
                            right: isEnd ? "4px" : 0,
                            backgroundColor: `hsl(${colColor} / 0.25)`,
                            borderLeft: isStart ? `3px solid hsl(${colColor})` : "none",
                            borderRadius: isStart && isEnd ? "6px" : isStart ? "6px 0 0 6px" : isEnd ? "0 6px 6px 0" : "0",
                          }}
                        >
                          {isEnd && (
                            <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
                              <span className="text-[9px] font-mono-display font-bold" style={{ color: `hsl(${colColor})` }}>
                                {card.progress !== undefined ? `${card.progress}%` : ""}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Unscheduled section */}
        {cardsWithoutDates.length > 0 && (
          <>
            <div className="flex items-center gap-3 mt-6 mb-3">
              <div className="h-px flex-1 bg-border/40" />
              <span className="text-[10px] font-mono-display tracking-widest text-muted-foreground/50 uppercase">Unscheduled ({cardsWithoutDates.length})</span>
              <div className="h-px flex-1 bg-border/40" />
            </div>
            {cardsWithoutDates.map(card => {
              const colColor = COLUMN_COLORS[card.columnId] || "var(--col-backlog)";
              return (
                <div key={card.id} className="flex items-center group hover:bg-muted/20 rounded-lg transition-colors">
                  <div className="w-64 shrink-0 pr-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: `hsl(${colColor})` }} />
                      <span className="text-sm text-foreground/60 truncate">{card.title}</span>
                    </div>
                    <span className="text-[10px] font-mono-display text-muted-foreground/40 ml-4 uppercase">{card.columnTitle}</span>
                  </div>
                  <div className="flex-1 grid grid-cols-15 gap-0 py-2">
                    {DAYS.map(d => (
                      <div key={d.num} className={`h-6 border-l border-border/5 ${d.isWeekend ? "bg-muted/5" : ""}`} />
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-8 pt-4 border-t border-border/30">
        {Object.entries(COLUMN_COLORS).map(([key, color]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: `hsl(${color})` }} />
            <span className="text-[10px] font-mono-display text-muted-foreground uppercase tracking-wide">{key}</span>
          </div>
        ))}
      </div>
    </div>
  );
}