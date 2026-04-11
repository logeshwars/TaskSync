import { useState } from "react";
import { X, Plus, Tag } from "lucide-react";
import { Priority } from "./KanbanCard";
import { ColumnData } from "./KanbanColumn";

const AVAILABLE_TAGS = ["Design", "Frontend", "Backend", "API", "UX", "Mobile", "Testing", "Research"];

const priorityOptions: { value: Priority; label: string; color: string }[] = [
  { value: "critical", label: "Critical", color: "bg-destructive/20 text-destructive border-destructive/40" },
  { value: "high", label: "High", color: "bg-[hsl(var(--col-todo)/0.2)] text-[hsl(var(--col-todo))] border-[hsl(var(--col-todo)/0.4)]" },
  { value: "medium", label: "Medium", color: "bg-[hsl(var(--col-progress)/0.2)] text-[hsl(var(--col-progress))] border-[hsl(var(--col-progress)/0.4)]" },
  { value: "low", label: "Low", color: "bg-[hsl(var(--col-done)/0.2)] text-[hsl(var(--col-done))] border-[hsl(var(--col-done)/0.4)]" },
];

interface NewCardDialogProps {
  open: boolean;
  onClose: () => void;
  columns: ColumnData[];
  onAdd: (columnId: string, title: string, priority: Priority, description?: string, tags?: string[], dueDate?: string) => void;
}

export function NewCardDialog({ open, onClose, columns, onAdd }: NewCardDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [selectedColumn, setSelectedColumn] = useState(columns[0]?.id ?? "");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [showTagPicker, setShowTagPicker] = useState(false);

  if (!open) return null;

  const handleSubmit = () => {
    if (!title.trim()) return;
    onAdd(selectedColumn, title.trim(), priority, description.trim() || undefined, selectedTags.length > 0 ? selectedTags : undefined, dueDate || undefined);
    // Reset
    setTitle("");
    setDescription("");
    setPriority("medium");
    setSelectedColumn(columns[0]?.id ?? "");
    setSelectedTags([]);
    setDueDate("");
    onClose();
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative w-full max-w-lg mx-4 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
              <Plus className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground tracking-tight">New Card</h2>
              <p className="text-[10px] text-muted-foreground font-mono-display tracking-wider">CREATE A NEW TASK</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono-display font-bold tracking-widest text-muted-foreground uppercase">Title</label>
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors"
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono-display font-bold tracking-widest text-muted-foreground uppercase">Description <span className="text-muted-foreground/50">(Optional)</span></label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Add more details..."
              rows={3}
              className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors resize-none"
            />
          </div>

          {/* Column & Priority row */}
          <div className="grid grid-cols-2 gap-4">
            {/* Column */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono-display font-bold tracking-widest text-muted-foreground uppercase">Column</label>
              <select
                value={selectedColumn}
                onChange={e => setSelectedColumn(e.target.value)}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 transition-colors appearance-none cursor-pointer"
              >
                {columns.map(col => (
                  <option key={col.id} value={col.id}>{col.title}</option>
                ))}
              </select>
            </div>

            {/* Due Date */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono-display font-bold tracking-widest text-muted-foreground uppercase">Due Date <span className="text-muted-foreground/50">(Optional)</span></label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 transition-colors"
              />
            </div>
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono-display font-bold tracking-widest text-muted-foreground uppercase">Priority</label>
            <div className="flex gap-2">
              {priorityOptions.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPriority(p.value)}
                  className={`flex-1 text-xs font-mono-display font-bold py-2 rounded-xl border transition-all ${
                    priority === p.value
                      ? `${p.color} ring-1 ring-current scale-[1.02]`
                      : "bg-secondary text-muted-foreground border-border hover:border-muted-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono-display font-bold tracking-widest text-muted-foreground uppercase">Tags</label>
            <div className="flex flex-wrap gap-1.5">
              {selectedTags.map(tag => (
                <span
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className="tag-pill border border-primary/30 bg-primary/10 text-primary cursor-pointer hover:bg-primary/20 transition-colors"
                >
                  {tag} ×
                </span>
              ))}
              <button
                onClick={() => setShowTagPicker(!showTagPicker)}
                className="tag-pill border border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors flex items-center gap-1"
              >
                <Tag className="w-3 h-3" />
                Add Tag
              </button>
            </div>
            {showTagPicker && (
              <div className="flex flex-wrap gap-1.5 pt-1.5 border-t border-border/40 mt-1.5">
                {AVAILABLE_TAGS.filter(t => !selectedTags.includes(t)).map(tag => (
                  <button
                    key={tag}
                    onClick={() => { toggleTag(tag); }}
                    className="tag-pill border border-border text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border/60 bg-secondary/30">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-xl hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim()}
            className="flex items-center gap-2 bg-primary text-primary-foreground text-sm font-semibold px-5 py-2 rounded-xl hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            Create Card
          </button>
        </div>
      </div>
    </div>
  );
}