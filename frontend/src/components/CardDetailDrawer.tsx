/**
 * Card detail drawer.
 *
 * Opens as a right-side sheet when a card is clicked. Supports:
 *   - Inline editing of title, description, priority, tags, due date, progress.
 *   - Assignee display (picker deferred to when user service is wired).
 *   - Comments thread with add/delete.
 *   - Activity feed at the bottom.
 *
 * All mutations go through the API, then refetch the hydrated board so
 * the board view stays in sync.
 */
import { useEffect, useState } from 'react';
import {
  Calendar,
  Loader2,
  MessageSquare,
  Send,
  Trash2,
  X,
} from 'lucide-react';

import { api } from '@/lib/api';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchHydratedBoard, type CardItem } from '@/store/boards.slice';

// ---------------------------------------------------------------------------
// Types for API responses
// ---------------------------------------------------------------------------

interface CommentResponse {
  id: string;
  cardId: string;
  boardId: string;
  authorId: string;
  body: string;
  mentions: string[];
  editedAt: string | null;
  createdAt: string;
}

interface ActivityResponse {
  id: string;
  boardId: string;
  cardId: string | null;
  actorId: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    urgent: 'bg-destructive/20 text-destructive border-destructive/30',
    high: 'bg-[hsl(var(--col-todo)/0.15)] text-[hsl(var(--col-todo))] border-[hsl(var(--col-todo)/0.3)]',
    medium: 'bg-[hsl(var(--col-progress)/0.15)] text-[hsl(var(--col-progress))] border-[hsl(var(--col-progress)/0.3)]',
    low: 'bg-[hsl(var(--col-done)/0.15)] text-[hsl(var(--col-done))] border-[hsl(var(--col-done)/0.3)]',
  };
  const label = priority === 'urgent' ? 'CRITICAL' : priority.toUpperCase();
  return (
    <span className={`tag-pill border ${map[priority] ?? 'bg-muted text-muted-foreground border-border'}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface CardDetailDrawerProps {
  card: CardItem | null;
  onClose: () => void;
}

export function CardDetailDrawer({ card, onClose }: CardDetailDrawerProps) {
  const dispatch = useAppDispatch();
  const boardId = useAppSelector((s) => s.boards.active?.id);
  const currentUserId = useAppSelector((s) => s.auth.user?.id);

  // Editable fields (local state, saved on blur/enter).
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [progress, setProgress] = useState(0);
  const [dueDate, setDueDate] = useState('');

  // Comments & activity.
  const [comments, setComments] = useState<CommentResponse[]>([]);
  const [activities, setActivities] = useState<ActivityResponse[]>([]);
  const [commentBody, setCommentBody] = useState('');
  const [saving, setSaving] = useState(false);

  // Sync local state when the selected card changes.
  useEffect(() => {
    if (!card) return;
    setTitle(card.title);
    setDescription(card.description || '');
    setPriority(card.priority);
    setProgress(card.progress);
    setDueDate(card.dueDate ? card.dueDate.split('T')[0] : '');
  }, [card]);

  // Fetch comments and activity when the card is selected.
  useEffect(() => {
    if (!card || !boardId) return;
    api.get<CommentResponse[]>(`/cards/${card.id}/comments`).then((r) => setComments(r.data)).catch(() => {});
    api
      .get<ActivityResponse[]>(`/boards/${boardId}/activity`, { params: { limit: 20 } })
      .then((r) => setActivities(r.data.filter((a) => a.cardId === card.id)))
      .catch(() => {});
  }, [card, boardId]);

  if (!card) return null;

  // Save a field change via PATCH.
  const saveField = async (patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      await api.patch(`/cards/${card.id}`, patch);
      if (boardId) dispatch(fetchHydratedBoard(boardId));
    } finally {
      setSaving(false);
    }
  };

  const handleAddComment = async () => {
    if (!commentBody.trim()) return;
    try {
      await api.post(`/cards/${card.id}/comments`, { body: commentBody });
      setCommentBody('');
      // Refresh comments.
      const r = await api.get<CommentResponse[]>(`/cards/${card.id}/comments`);
      setComments(r.data);
      if (boardId) dispatch(fetchHydratedBoard(boardId));
    } catch { /* swallow */ }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await api.delete(`/comments/${commentId}`);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      if (boardId) dispatch(fetchHydratedBoard(boardId));
    } catch { /* swallow */ }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="relative w-full max-w-lg bg-card border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <PriorityBadge priority={priority} />
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Title */}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => { if (title !== card.title) saveField({ title }); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className="w-full text-lg font-bold text-foreground bg-transparent outline-none border-b border-transparent focus:border-primary/40 transition-colors pb-1"
          />

          {/* Description */}
          <div>
            <label className="text-[10px] font-mono-display font-bold tracking-widest text-muted-foreground uppercase mb-1 block">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => { if (description !== (card.description || '')) saveField({ description }); }}
              rows={3}
              placeholder="Add a description..."
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors resize-none"
            />
          </div>

          {/* Priority + Progress row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-mono-display font-bold tracking-widest text-muted-foreground uppercase mb-1 block">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => { setPriority(e.target.value); saveField({ priority: e.target.value }); }}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Critical</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-mono-display font-bold tracking-widest text-muted-foreground uppercase mb-1 block">
                Progress
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={progress}
                  onChange={(e) => setProgress(Number(e.target.value))}
                  onMouseUp={() => saveField({ progress })}
                  onTouchEnd={() => saveField({ progress })}
                  className="flex-1"
                />
                <span className="text-xs font-mono-display text-primary w-8 text-right">{progress}%</span>
              </div>
            </div>
          </div>

          {/* Due date */}
          <div>
            <label className="text-[10px] font-mono-display font-bold tracking-widest text-muted-foreground uppercase mb-1 block">
              Due Date
            </label>
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="date"
                value={dueDate}
                onChange={(e) => { setDueDate(e.target.value); saveField({ dueDate: e.target.value || null }); }}
                className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors"
              />
            </div>
          </div>

          {/* Tags */}
          {card.tags.length > 0 && (
            <div>
              <label className="text-[10px] font-mono-display font-bold tracking-widest text-muted-foreground uppercase mb-1 block">
                Tags
              </label>
              <div className="flex flex-wrap gap-1">
                {card.tags.map((t) => (
                  <span key={t} className="tag-pill border border-border bg-secondary text-muted-foreground text-xs">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Assignees */}
          {card.assignees.length > 0 && (
            <div>
              <label className="text-[10px] font-mono-display font-bold tracking-widest text-muted-foreground uppercase mb-1 block">
                Assignees
              </label>
              <div className="flex gap-1">
                {card.assignees.map((a) => (
                  <div key={a} className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-[10px] font-bold text-accent-foreground" title={a}>
                    {a.slice(-2).toUpperCase()}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Comments */}
          <div>
            <label className="text-[10px] font-mono-display font-bold tracking-widest text-muted-foreground uppercase mb-2 block">
              <MessageSquare className="w-3 h-3 inline mr-1" />
              Comments ({comments.length})
            </label>

            {/* Add comment */}
            <div className="flex gap-2 mb-3">
              <input
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddComment(); }}
                placeholder="Write a comment..."
                className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors"
              />
              <button
                onClick={handleAddComment}
                disabled={!commentBody.trim()}
                className="p-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>

            {/* Comment list */}
            <div className="space-y-2">
              {comments.map((c) => (
                <div key={c.id} className="bg-secondary rounded-lg px-3 py-2 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono-display text-muted-foreground">
                      {c.authorId.slice(-6)} &middot; {new Date(c.createdAt).toLocaleString()}
                    </span>
                    {c.authorId === currentUserId && (
                      <button
                        onClick={() => handleDeleteComment(c.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <p className="text-foreground">{c.body}</p>
                </div>
              ))}
              {comments.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">No comments yet</p>
              )}
            </div>
          </div>

          {/* Activity feed */}
          {activities.length > 0 && (
            <div>
              <label className="text-[10px] font-mono-display font-bold tracking-widest text-muted-foreground uppercase mb-2 block">
                Activity
              </label>
              <div className="space-y-1.5">
                {activities.map((a) => (
                  <div key={a.id} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    <div>
                      <span className="text-foreground font-medium">{a.type}</span>
                      {' '}&middot;{' '}
                      {new Date(a.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
