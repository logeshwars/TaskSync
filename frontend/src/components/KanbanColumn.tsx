import { useState, useRef } from "react";
import { Plus, X } from "lucide-react";
import { KanbanCard, CardData, Priority } from "./KanbanCard";

export type ColumnColor = "backlog" | "todo" | "progress" | "done" | "blocked";

export interface ColumnData {
  id: string;
  title: string;
  color: ColumnColor;
  cards: CardData[];
  limit?: number;
}

const colColorMap: Record<ColumnColor, { header: string; dot: string; glow: string }> = {
  backlog:  { header: "text-[hsl(var(--col-backlog))]",  dot: "bg-[hsl(var(--col-backlog))]",  glow: "col-glow-backlog" },
  todo:     { header: "text-[hsl(var(--col-todo))]",     dot: "bg-[hsl(var(--col-todo))]",     glow: "col-glow-todo" },
  progress: { header: "text-[hsl(var(--col-progress))]", dot: "bg-[hsl(var(--col-progress))]", glow: "col-glow-progress" },
  done:     { header: "text-[hsl(var(--col-done))]",     dot: "bg-[hsl(var(--col-done))]",     glow: "col-glow-done" },
  blocked:  { header: "text-[hsl(var(--col-blocked))]",  dot: "bg-[hsl(var(--col-blocked))]",  glow: "col-glow-blocked" },
};

interface AddCardFormProps {
  onAdd: (title: string, priority: Priority) => void;
  onCancel: () => void;
}

function AddCardForm({ onAdd, onCancel }: AddCardFormProps) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");

  return (
    <div className="bg-secondary rounded-xl border border-border p-3 space-y-2">
      <textarea
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Card title..."
        rows={2}
        className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none"
        onKeyDown={e => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (title.trim()) onAdd(title.trim(), priority);
          }
          if (e.key === "Escape") onCancel();
        }}
      />
      <div className="flex gap-1 flex-wrap">
        {(["critical", "high", "medium", "low"] as Priority[]).map(p => (
          <button
            key={p}
            onClick={() => setPriority(p)}
            className={`text-[10px] font-mono-display px-2 py-0.5 rounded-full border transition-all ${priority === p ? "bg-primary/20 text-primary border-primary/40" : "text-muted-foreground border-border hover:border-muted-foreground"}`}
          >
            {p.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => { if (title.trim()) onAdd(title.trim(), priority); }}
          className="flex-1 text-xs py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
        >
          Add Card
        </button>
        <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

interface KanbanColumnProps {
  column: ColumnData;
  onDragStart: (e: React.DragEvent, cardId: string, fromColumn: string) => void;
  onDragOver: (e: React.DragEvent, columnId: string) => void;
  onDrop: (e: React.DragEvent, toColumn: string) => void;
  onAddCard: (columnId: string, title: string, priority: Priority) => void;
  onDeleteCard: (columnId: string, cardId: string) => void;
  isDragOver: boolean;
}

export function KanbanColumn({ column, onDragStart, onDragOver, onDrop, onAddCard, onDeleteCard, isDragOver }: KanbanColumnProps) {
  const [showAdd, setShowAdd] = useState(false);
  const colors = colColorMap[column.color];
  const isOverLimit = column.limit && column.cards.length >= column.limit;

  return (
    <div
      className={`flex flex-col w-72 shrink-0 rounded-2xl border bg-card transition-all duration-200 ${colors.glow} ${isDragOver ? "drag-over" : ""}`}
      onDragOver={e => { e.preventDefault(); onDragOver(e, column.id); }}
      onDrop={e => onDrop(e, column.id)}
    >
      {/* Column header */}
      <div className="px-4 pt-4 pb-3 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
            <h3 className={`text-xs font-mono-display font-bold tracking-widest uppercase ${colors.header}`}>
              {column.title}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono-display text-xs text-muted-foreground">
              {column.cards.length}{column.limit ? `/${column.limit}` : ""}
            </span>
            {!isOverLimit && (
              <button
                onClick={() => setShowAdd(true)}
                className="w-5 h-5 rounded-md bg-secondary hover:bg-muted transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        {isOverLimit && (
          <p className="text-[10px] text-destructive font-mono-display mt-1 tracking-wide">WIP LIMIT REACHED</p>
        )}
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3 space-y-2.5 min-h-[120px]">
        {column.cards.map(card => (
          <KanbanCard
            key={card.id}
            card={card}
            columnId={column.id}
            onDragStart={onDragStart}
            onDelete={onDeleteCard}
          />
        ))}

        {showAdd && (
          <AddCardForm
            onAdd={(title, priority) => {
              onAddCard(column.id, title, priority);
              setShowAdd(false);
            }}
            onCancel={() => setShowAdd(false)}
          />
        )}

        {column.cards.length === 0 && !showAdd && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className={`w-8 h-8 rounded-full opacity-20 mb-2 ${colors.dot}`} />
            <p className="text-xs text-muted-foreground font-mono-display tracking-wide">EMPTY</p>
          </div>
        )}
      </div>

      {/* Footer add button */}
      {!showAdd && !isOverLimit && (
        <button
          onClick={() => setShowAdd(true)}
          className="mx-3 mb-3 mt-1 py-2 rounded-xl border border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-xs text-muted-foreground hover:text-primary flex items-center justify-center gap-1.5 font-medium"
        >
          <Plus className="w-3.5 h-3.5" />
          Add card
        </button>
      )}
    </div>
  );
}
