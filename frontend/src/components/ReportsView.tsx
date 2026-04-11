import { ColumnData } from "./KanbanColumn";
import { TrendingUp, CheckCircle2, AlertTriangle, Clock, Users, BarChart3 } from "lucide-react";

const COLUMN_COLORS: Record<string, string> = {
  backlog: "var(--col-backlog)",
  todo: "var(--col-todo)",
  progress: "var(--col-progress)",
  done: "var(--col-done)",
  blocked: "var(--col-blocked)",
};

interface ReportsViewProps {
  columns: ColumnData[];
}

export function ReportsView({ columns }: ReportsViewProps) {
  const allCards = columns.flatMap(col =>
    col.cards.map(card => ({ ...card, columnId: col.id }))
  );

  const total = allCards.length;
  const byColumn = columns.map(col => ({ id: col.id, title: col.title, count: col.cards.length, color: COLUMN_COLORS[col.color] }));
  const byPriority = {
    critical: allCards.filter(c => c.priority === "critical").length,
    high: allCards.filter(c => c.priority === "high").length,
    medium: allCards.filter(c => c.priority === "medium").length,
    low: allCards.filter(c => c.priority === "low").length,
  };

  const doneCount = columns.find(c => c.id === "done")?.cards.length ?? 0;
  const blockedCount = columns.find(c => c.id === "blocked")?.cards.length ?? 0;
  const progressCount = columns.find(c => c.id === "progress")?.cards.length ?? 0;
  const completionRate = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  const members = [
    { name: "Alex", color: "#6366f1" },
    { name: "Maya", color: "#10b981" },
    { name: "Sam", color: "#f59e0b" },
    { name: "Jordan", color: "#ec4899" },
  ];

  const memberStats = members.map(m => {
    const cards = allCards.filter(c => c.assignee?.name === m.name);
    const done = cards.filter(c => c.columnId === "done").length;
    return { ...m, total: cards.length, done };
  });

  const maxCol = Math.max(...byColumn.map(c => c.count), 1);

  // Simulated velocity data (last 5 sprints)
  const velocity = [
    { sprint: "#10", done: 6, planned: 10 },
    { sprint: "#11", done: 8, planned: 11 },
    { sprint: "#12", done: 7, planned: 9 },
    { sprint: "#13", done: 9, planned: 12 },
    { sprint: "#14", done: doneCount, planned: total },
  ];
  const maxVelocity = Math.max(...velocity.map(v => Math.max(v.done, v.planned)), 1);

  return (
    <div className="flex-1 overflow-auto scrollbar-thin px-6 py-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "COMPLETION", value: `${completionRate}%`, icon: CheckCircle2, accent: "var(--col-done)", sub: `${doneCount} of ${total} tasks` },
          { label: "IN PROGRESS", value: String(progressCount), icon: Clock, accent: "var(--col-progress)", sub: "Active tasks" },
          { label: "BLOCKED", value: String(blockedCount), icon: AlertTriangle, accent: "var(--col-blocked)", sub: "Needs attention" },
          { label: "VELOCITY", value: "8.2", icon: TrendingUp, accent: "158 64% 52%", sub: "Avg tasks/sprint" },
        ].map(kpi => (
          <div key={kpi.label} className="bg-card border border-border rounded-2xl p-5 relative overflow-hidden group hover:border-border/80 transition-colors">
            <div className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-[0.04]" style={{ backgroundColor: `hsl(${kpi.accent})` }} />
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-mono-display tracking-widest text-muted-foreground">{kpi.label}</span>
              <kpi.icon className="w-4 h-4" style={{ color: `hsl(${kpi.accent})` }} />
            </div>
            <div className="text-2xl font-bold font-mono-display" style={{ color: `hsl(${kpi.accent})` }}>{kpi.value}</div>
            <div className="text-[10px] text-muted-foreground/60 font-mono-display mt-1">{kpi.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Task distribution bar chart */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            <span className="text-[10px] font-mono-display tracking-widest text-muted-foreground uppercase">Task Distribution</span>
          </div>
          <div className="space-y-3">
            {byColumn.map(col => (
              <div key={col.id}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: `hsl(${col.color})` }} />
                    <span className="text-xs text-foreground/80">{col.title}</span>
                  </div>
                  <span className="text-xs font-mono-display font-bold" style={{ color: `hsl(${col.color})` }}>{col.count}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(col.count / maxCol) * 100}%`,
                      backgroundColor: `hsl(${col.color})`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Priority breakdown */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-5">
            <AlertTriangle className="w-4 h-4 text-muted-foreground" />
            <span className="text-[10px] font-mono-display tracking-widest text-muted-foreground uppercase">Priority Breakdown</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {([
              { key: "critical", label: "Critical", color: "var(--destructive)", textColor: "text-destructive" },
              { key: "high", label: "High", color: "var(--col-todo)", textColor: "text-[hsl(var(--col-todo))]" },
              { key: "medium", label: "Medium", color: "var(--col-progress)", textColor: "text-[hsl(var(--col-progress))]" },
              { key: "low", label: "Low", color: "var(--col-done)", textColor: "text-[hsl(var(--col-done))]" },
            ] as const).map(p => (
              <div key={p.key} className="bg-secondary/50 rounded-xl p-3 border border-border/50">
                <div className="text-2xl font-bold font-mono-display mb-1" style={{ color: `hsl(${p.color})` }}>
                  {byPriority[p.key]}
                </div>
                <div className="text-[10px] font-mono-display text-muted-foreground tracking-widest uppercase">{p.label}</div>
                <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: total > 0 ? `${(byPriority[p.key] / total) * 100}%` : "0%",
                      backgroundColor: `hsl(${p.color})`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sprint velocity */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-5">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <span className="text-[10px] font-mono-display tracking-widest text-muted-foreground uppercase">Sprint Velocity</span>
          </div>
          <div className="flex items-end gap-3 h-40">
            {velocity.map(v => (
              <div key={v.sprint} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex gap-1 items-end" style={{ height: "120px" }}>
                  <div className="flex-1 rounded-t-md bg-muted/40 transition-all" style={{ height: `${(v.planned / maxVelocity) * 100}%` }} />
                  <div className="flex-1 rounded-t-md transition-all" style={{ height: `${(v.done / maxVelocity) * 100}%`, backgroundColor: "hsl(var(--primary))" }} />
                </div>
                <span className="text-[9px] font-mono-display text-muted-foreground">{v.sprint}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/30">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-muted/40" />
              <span className="text-[9px] font-mono-display text-muted-foreground">Planned</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-primary" />
              <span className="text-[9px] font-mono-display text-muted-foreground">Completed</span>
            </div>
          </div>
        </div>

        {/* Team workload */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-5">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-[10px] font-mono-display tracking-widest text-muted-foreground uppercase">Team Workload</span>
          </div>
          <div className="space-y-4">
            {memberStats.map(m => (
              <div key={m.name} className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-background shrink-0"
                  style={{ backgroundColor: m.color }}
                >
                  {m.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-foreground">{m.name}</span>
                    <span className="text-xs font-mono-display text-muted-foreground">
                      {m.done}/{m.total} done
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: m.total > 0 ? `${(m.done / m.total) * 100}%` : "0%",
                        backgroundColor: m.color,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}