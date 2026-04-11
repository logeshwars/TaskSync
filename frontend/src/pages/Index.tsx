import { useState } from "react";
import { Plus, Search, Bell, User, Zap, BarChart2, Settings, Filter } from "lucide-react";
import { KanbanColumn, ColumnData } from "@/components/KanbanColumn";
import { CardData, Priority } from "@/components/KanbanCard";
import { NewCardDialog } from "@/components/NewCardDialog";
import { TimelineView } from "@/components/TimelineView";
import { CalendarView } from "@/components/CalendarView";
import { ReportsView } from "@/components/ReportsView";
import boardBg from "@/assets/board-bg.jpg";

type TabView = "Board" | "Timeline" | "Calendar" | "Reports";

const INITIAL_COLUMNS: ColumnData[] = [
  {
    id: "backlog",
    title: "Backlog",
    color: "backlog",
    cards: [
      {
        id: "c1",
        title: "Redesign onboarding flow for new enterprise clients",
        description: "Map out all touchpoints and pain points in the current flow.",
        priority: "medium",
        tags: ["UX", "Research"],
        assignee: { name: "Alex", color: "#6366f1" },
        comments: 4,
        attachments: 2,
        dueDate: "Mar 12",
      },
      {
        id: "c2",
        title: "Audit third-party API integrations",
        priority: "low",
        tags: ["API", "Backend"],
        assignee: { name: "Sam", color: "#f59e0b" },
        comments: 1,
      },
    ],
  },
  {
    id: "todo",
    title: "To Do",
    color: "todo",
    limit: 5,
    cards: [
      {
        id: "c3",
        title: "Build new component library documentation site",
        description: "Storybook integration with auto-generated docs.",
        priority: "high",
        tags: ["Frontend", "Design"],
        assignee: { name: "Maya", color: "#10b981" },
        comments: 7,
        progress: 20,
        dueDate: "Mar 15",
      },
      {
        id: "c4",
        title: "Write unit tests for auth module",
        priority: "high",
        tags: ["Testing", "Backend"],
        assignee: { name: "Jordan", color: "#ec4899" },
        comments: 2,
        attachments: 1,
      },
      {
        id: "c5",
        title: "Set up CI/CD pipeline for staging environment",
        priority: "critical",
        tags: ["Backend"],
        assignee: { name: "Alex", color: "#6366f1" },
        dueDate: "Mar 10",
      },
    ],
  },
  {
    id: "progress",
    title: "In Progress",
    color: "progress",
    limit: 3,
    cards: [
      {
        id: "c6",
        title: "Mobile responsive dashboard redesign",
        description: "Complete overhaul of the analytics dashboard for sub-768px breakpoints.",
        priority: "high",
        tags: ["Mobile", "Design"],
        assignee: { name: "Maya", color: "#10b981" },
        comments: 12,
        attachments: 5,
        progress: 65,
        dueDate: "Mar 8",
      },
      {
        id: "c7",
        title: "Integrate Stripe payment webhooks",
        priority: "critical",
        tags: ["Backend", "API"],
        assignee: { name: "Sam", color: "#f59e0b" },
        comments: 3,
        progress: 40,
        dueDate: "Mar 9",
      },
    ],
  },
  {
    id: "done",
    title: "Done",
    color: "done",
    cards: [
      {
        id: "c8",
        title: "User profile settings page",
        priority: "medium",
        tags: ["Frontend", "UX"],
        assignee: { name: "Jordan", color: "#ec4899" },
        comments: 5,
        progress: 100,
      },
      {
        id: "c9",
        title: "Password reset email flow",
        priority: "high",
        tags: ["Backend"],
        assignee: { name: "Alex", color: "#6366f1" },
        comments: 2,
        progress: 100,
      },
    ],
  },
  {
    id: "blocked",
    title: "Blocked",
    color: "blocked",
    cards: [
      {
        id: "c10",
        title: "GDPR compliance audit — waiting on legal team",
        description: "Cannot proceed until legal reviews the data retention policies.",
        priority: "critical",
        tags: ["Research"],
        assignee: { name: "Sam", color: "#f59e0b" },
        comments: 6,
        dueDate: "Mar 20",
      },
    ],
  },
];

let cardCounter = 100;

const Index = () => {
  const [columns, setColumns] = useState<ColumnData[]>(INITIAL_COLUMNS);
  const [dragging, setDragging] = useState<{ cardId: string; fromColumn: string } | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showNewCard, setShowNewCard] = useState(false);
  const [activeTab, setActiveTab] = useState<TabView>("Board");

  const totalCards = columns.reduce((sum, c) => sum + c.cards.length, 0);
  const doneCards = columns.find(c => c.id === "done")?.cards.length ?? 0;
  const blockedCards = columns.find(c => c.id === "blocked")?.cards.length ?? 0;

  const handleDragStart = (e: React.DragEvent, cardId: string, fromColumn: string) => {
    setDragging({ cardId, fromColumn });
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (_e: React.DragEvent, columnId: string) => {
    setDragOverColumn(columnId);
  };

  const handleDrop = (_e: React.DragEvent, toColumn: string) => {
    if (!dragging || dragging.fromColumn === toColumn) {
      setDragging(null);
      setDragOverColumn(null);
      return;
    }
    setColumns(prev => {
      const next = prev.map(col => ({ ...col, cards: [...col.cards] }));
      const from = next.find(c => c.id === dragging.fromColumn);
      const to = next.find(c => c.id === toColumn);
      if (!from || !to) return prev;
      const cardIdx = from.cards.findIndex(c => c.id === dragging.cardId);
      if (cardIdx === -1) return prev;
      const [card] = from.cards.splice(cardIdx, 1);
      to.cards.push(card);
      return next;
    });
    setDragging(null);
    setDragOverColumn(null);
  };

  const handleAddCard = (columnId: string, title: string, priority: Priority, description?: string, tags?: string[], dueDate?: string) => {
    const newCard: CardData = {
      id: `new-${cardCounter++}`,
      title,
      priority,
      description,
      tags: tags ?? [],
      dueDate,
    };
    setColumns(prev =>
      prev.map(col =>
        col.id === columnId ? { ...col, cards: [...col.cards, newCard] } : col
      )
    );
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    setColumns(prev =>
      prev.map(col =>
        col.id === columnId ? { ...col, cards: col.cards.filter(c => c.id !== cardId) } : col
      )
    );
  };

  const filteredColumns = search
    ? columns.map(col => ({
        ...col,
        cards: col.cards.filter(c =>
          c.title.toLowerCase().includes(search.toLowerCase()) ||
          c.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
        ),
      }))
    : columns;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundImage: `url(${boardBg})`, backgroundSize: "cover", backgroundPosition: "center" }}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-background/92 pointer-events-none" />

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Top Navigation */}
        <header className="flex items-center justify-between px-6 py-3.5 border-b border-border bg-card/60 backdrop-blur-sm">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                <Zap className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-mono-display font-bold text-sm tracking-wider text-foreground">TASKSYNC</span>
            </div>
            <nav className="hidden md:flex items-center gap-1">
              {(["Board", "Timeline", "Calendar", "Reports"] as TabView[]).map(item => (
                <button
                  key={item}
                  onClick={() => setActiveTab(item)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${activeTab === item ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                >
                  {item}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative hidden sm:flex items-center">
              <Search className="absolute left-2.5 w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search cards..."
                className="bg-secondary border border-border rounded-lg pl-8 pr-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors w-44 focus:w-56"
              />
            </div>
            <button className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
              <Filter className="w-4 h-4" />
            </button>
            <button className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground relative">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-destructive rounded-full" />
            </button>
            <button className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
              <Settings className="w-4 h-4" />
            </button>
            <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-accent-foreground ml-1">
              <User className="w-4 h-4" />
            </div>
          </div>
        </header>

        {/* Board header bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Product Sprint <span className="text-primary">#14</span></h1>
            <p className="text-xs text-muted-foreground font-mono-display mt-0.5 tracking-wide">MAR 1 – MAR 15, 2026 · TEAM TASKSYNC</p>
          </div>

          {/* Stats */}
          <div className="hidden lg:flex items-center gap-6">
            <div className="text-center">
              <div className="text-lg font-bold font-mono-display text-foreground">{totalCards}</div>
              <div className="text-[10px] text-muted-foreground font-mono-display tracking-widest">TOTAL</div>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-center">
              <div className="text-lg font-bold font-mono-display text-[hsl(var(--col-done))]">{doneCards}</div>
              <div className="text-[10px] text-muted-foreground font-mono-display tracking-widest">DONE</div>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-center">
              <div className="text-lg font-bold font-mono-display text-destructive">{blockedCards}</div>
              <div className="text-[10px] text-muted-foreground font-mono-display tracking-widest">BLOCKED</div>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="flex items-center gap-1.5">
              <div className="flex -space-x-1.5">
                {[
                  { name: "Alex", color: "#6366f1" },
                  { name: "Maya", color: "#10b981" },
                  { name: "Sam", color: "#f59e0b" },
                  { name: "Jordan", color: "#ec4899" },
                ].map(m => (
                  <div
                    key={m.name}
                    className="w-7 h-7 rounded-full border-2 border-background flex items-center justify-center text-[10px] font-bold text-background"
                    style={{ backgroundColor: m.color }}
                    title={m.name}
                  >
                    {m.name[0]}
                  </div>
                ))}
              </div>
              <span className="text-xs text-muted-foreground">4 members</span>
            </div>
          </div>

          <button
            onClick={() => setShowNewCard(true)}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-semibold px-4 py-2 rounded-xl hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Card</span>
          </button>
        </div>

        {/* View content */}
        {activeTab === "Board" && (
          <div className="flex-1 overflow-x-auto scrollbar-thin px-6 py-6">
            <div className="flex gap-5 items-start pb-6" style={{ minWidth: "max-content" }}>
              {filteredColumns.map(col => (
                <KanbanColumn
                  key={col.id}
                  column={col}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onAddCard={handleAddCard}
                  onDeleteCard={handleDeleteCard}
                  isDragOver={dragOverColumn === col.id}
                />
              ))}
              <button className="w-72 shrink-0 h-20 rounded-2xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-muted-foreground hover:text-primary flex items-center justify-center gap-2 text-sm font-medium">
                <Plus className="w-4 h-4" />
                Add Column
              </button>
            </div>
          </div>
        )}

        {activeTab === "Timeline" && <TimelineView columns={columns} />}
        {activeTab === "Calendar" && <CalendarView columns={columns} />}
        {activeTab === "Reports" && <ReportsView columns={columns} />}

        {/* Bottom status bar */}
        <footer className="flex items-center justify-between px-6 py-2.5 border-t border-border bg-card/40 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-mono-display tracking-wide">
              {Math.round((doneCards / totalCards) * 100)}% COMPLETE
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <div className="h-1.5 w-48 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${Math.round((doneCards / totalCards) * 100)}%` }}
              />
            </div>
          </div>
          <span className="text-[10px] text-muted-foreground font-mono-display">TASKSYNC v1.0 · SPRINT BOARD</span>
        </footer>

        {/* New Card Dialog */}
        <NewCardDialog
          open={showNewCard}
          onClose={() => setShowNewCard(false)}
          columns={columns}
          onAdd={handleAddCard}
        />
      </div>
    </div>
  );
};

export default Index;
