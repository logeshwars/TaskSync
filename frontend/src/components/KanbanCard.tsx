import { useState } from "react";
import { MoreHorizontal, MessageSquare, Paperclip, Calendar, GripVertical } from "lucide-react";

export type Priority = "critical" | "high" | "medium" | "low";
export type Tag = string;

export interface CardData {
  id: string;
  title: string;
  description?: string;
  priority: Priority;
  tags: Tag[];
  assignee?: { name: string; color: string };
  comments?: number;
  attachments?: number;
  dueDate?: string;
  progress?: number;
}

const priorityConfig: Record<Priority, { label: string; className: string }> = {
  critical: { label: "CRITICAL", className: "bg-destructive/20 text-destructive border border-destructive/30" },
  high:     { label: "HIGH",     className: "bg-[hsl(var(--col-todo)/0.15)] text-[hsl(var(--col-todo))] border border-[hsl(var(--col-todo)/0.3)]" },
  medium:   { label: "MED",      className: "bg-[hsl(var(--col-progress)/0.15)] text-[hsl(var(--col-progress))] border border-[hsl(var(--col-progress)/0.3)]" },
  low:      { label: "LOW",      className: "bg-[hsl(var(--col-done)/0.15)] text-[hsl(var(--col-done))] border border-[hsl(var(--col-done)/0.3)]" },
};

const tagColors: Record<string, string> = {
  Design:    "bg-[hsl(261_73%_65%/0.15)] text-[hsl(261,73%,75%)] border-[hsl(261_73%_65%/0.25)]",
  Frontend:  "bg-[hsl(210_80%_60%/0.15)] text-[hsl(210,80%,72%)] border-[hsl(210_80%_60%/0.25)]",
  Backend:   "bg-[hsl(43_90%_58%/0.15)] text-[hsl(43,90%,65%)] border-[hsl(43_90%_58%/0.25)]",
  Research:  "bg-[hsl(0_72%_60%/0.15)] text-[hsl(0,72%,72%)] border-[hsl(0_72%_60%/0.25)]",
  API:       "bg-[hsl(158_64%_52%/0.15)] text-[hsl(158,64%,60%)] border-[hsl(158_64%_52%/0.25)]",
  UX:        "bg-[hsl(300_60%_60%/0.15)] text-[hsl(300,60%,72%)] border-[hsl(300_60%_60%/0.25)]",
  Mobile:    "bg-[hsl(190_70%_55%/0.15)] text-[hsl(190,70%,65%)] border-[hsl(190_70%_55%/0.25)]",
  Testing:   "bg-[hsl(30_80%_58%/0.15)] text-[hsl(30,80%,65%)] border-[hsl(30_80%_58%/0.25)]",
};

function getTagClass(tag: string) {
  return tagColors[tag] || "bg-muted text-muted-foreground border-border";
}

interface KanbanCardProps {
  card: CardData;
  onDragStart: (e: React.DragEvent, cardId: string, fromColumn: string) => void;
  columnId: string;
  onDelete: (columnId: string, cardId: string) => void;
  onClick?: (cardId: string) => void;
}

export function KanbanCard({ card, onDragStart, columnId, onDelete, onClick }: KanbanCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const priority = priorityConfig[card.priority];

  return (
    <div
      draggable
      onDragStart={(e) => {
        setIsDragging(true);
        onDragStart(e, card.id, columnId);
      }}
      onDragEnd={() => setIsDragging(false)}
      onClick={() => onClick?.(card.id)}
      className={`group relative rounded-xl border border-border bg-card p-3.5 cursor-grab active:cursor-grabbing card-hover select-none ${isDragging ? "dragging" : ""}`}
    >
      {/* Drag handle */}
      <div className="absolute left-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-30 transition-opacity">
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
      </div>

      {/* Top row */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <span className={`tag-pill border ${priority.className}`}>{priority.label}</span>
        <button
          onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
          className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-muted-foreground transition-opacity relative"
        >
          <MoreHorizontal className="w-4 h-4" />
          {showMenu && (
            <div className="absolute right-0 top-5 z-20 bg-popover border border-border rounded-lg shadow-2xl py-1 w-32 text-sm">
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(columnId, card.id); setShowMenu(false); }}
                className="w-full text-left px-3 py-1.5 text-destructive hover:bg-muted transition-colors"
              >
                Delete
              </button>
            </div>
          )}
        </button>
      </div>

      {/* Title */}
      <p className="text-sm font-medium leading-snug mb-2 text-foreground">{card.title}</p>

      {/* Description */}
      {card.description && (
        <p className="text-xs text-muted-foreground mb-2.5 leading-relaxed line-clamp-2">{card.description}</p>
      )}

      {/* Progress bar */}
      {card.progress !== undefined && (
        <div className="mb-3">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] font-mono-display text-muted-foreground">PROGRESS</span>
            <span className="text-[10px] font-mono-display text-primary">{card.progress}%</span>
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${card.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Tags */}
      {card.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2.5">
          {card.tags.map(tag => (
            <span key={tag} className={`tag-pill border ${getTagClass(tag)}`}>{tag}</span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-border/50">
        <div className="flex items-center gap-3 text-muted-foreground">
          {card.comments !== undefined && (
            <span className="flex items-center gap-1 text-[11px]">
              <MessageSquare className="w-3 h-3" />
              {card.comments}
            </span>
          )}
          {card.attachments !== undefined && (
            <span className="flex items-center gap-1 text-[11px]">
              <Paperclip className="w-3 h-3" />
              {card.attachments}
            </span>
          )}
          {card.dueDate && (
            <span className="flex items-center gap-1 text-[11px]">
              <Calendar className="w-3 h-3" />
              {card.dueDate}
            </span>
          )}
        </div>
        {card.assignee && (
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-background shrink-0"
            style={{ backgroundColor: card.assignee.color }}
            title={card.assignee.name}
          >
            {card.assignee.name.charAt(0)}
          </div>
        )}
      </div>
    </div>
  );
}
