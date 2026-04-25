/**
 * Main board page.
 *
 * Reads the hydrated board from Redux (populated by WorkspaceBoardSelector
 * on mount) and transforms it into the ColumnData[] shape the existing
 * presentational components expect.
 *
 * Drag-drop fires an optimistic Redux update followed by PATCH /cards/:id/move.
 * If the server rejects, we refetch the board to roll back.
 */
import { useMemo, useRef, useState } from 'react';
import { Plus, Search, Bell, User, UserPlus, Zap, BarChart2, Settings, Filter, Loader2, LogOut } from 'lucide-react';

import { KanbanColumn } from '@/components/KanbanColumn';
import type { Priority } from '@/components/KanbanCard';
import { NewCardDialog } from '@/components/NewCardDialog';
import { TimelineView } from '@/components/TimelineView';
import { CalendarView } from '@/components/CalendarView';
import { ReportsView } from '@/components/ReportsView';
import { CardDetailDrawer } from '@/components/CardDetailDrawer';
import { InviteMemberDialog } from '@/components/InviteMemberDialog';
import { WorkspaceBoardSelector } from '@/components/WorkspaceBoardSelector';
import { PresenceAvatars } from '@/components/PresenceAvatars';
import { hydratedBoardToColumns } from '@/lib/board-transform';
import { api } from '@/lib/api';
import { useRealtimeBoard } from '@/hooks/use-realtime-board';
import { useAppDispatch, useAppSelector } from '@/store';
import { logout } from '@/store/auth.slice';
import {
  fetchHydratedBoard,
  moveCardOptimistic,
} from '@/store/boards.slice';
import boardBg from '@/assets/board-bg.jpg';

type TabView = 'Board' | 'Timeline' | 'Calendar' | 'Reports';

const Index = () => {
  const dispatch = useAppDispatch();
  const { active: board, hydrateStatus, status: boardsStatus } = useAppSelector((s) => s.boards);
  const { status: wsStatus } = useAppSelector((s) => s.workspaces);
  const authUser = useAppSelector((s) => s.auth.user);

  // Subscribe to realtime events for the active board.
  useRealtimeBoard(board?.id ?? null);

  const [dragging, setDragging] = useState<{ cardId: string; fromColumn: string } | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showNewCard, setShowNewCard] = useState(false);
  const [activeTab, setActiveTab] = useState<TabView>('Board');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [columnLoading, setColumnLoading] = useState(false);
  const columnInputRef = useRef<HTMLInputElement>(null);

  // Find the full CardItem from the hydrated board for the detail drawer.
  const selectedCard = selectedCardId && board
    ? board.cards.find((c) => c.id === selectedCardId) ?? null
    : null;

  // Transform hydrated board into the UI shape.
  const columns = useMemo(() => {
    if (!board) return [];
    return hydratedBoardToColumns(board);
  }, [board]);

  const totalCards = columns.reduce((sum, c) => sum + c.cards.length, 0);
  const doneCards = columns.find((c) => c.title.toLowerCase() === 'done')?.cards.length ?? 0;
  const blockedCards = columns.find((c) => c.title.toLowerCase() === 'blocked')?.cards.length ?? 0;

  // ---------------------------------------------------------------------------
  // Drag & drop — optimistic move + API call
  // ---------------------------------------------------------------------------

  const handleDragStart = (e: React.DragEvent, cardId: string, fromColumn: string) => {
    setDragging({ cardId, fromColumn });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (_e: React.DragEvent, columnId: string) => {
    setDragOverColumn(columnId);
  };

  const handleDrop = async (_e: React.DragEvent, toColumn: string) => {
    if (!dragging || dragging.fromColumn === toColumn || !board) {
      setDragging(null);
      setDragOverColumn(null);
      return;
    }

    const { cardId, fromColumn } = dragging;
    setDragging(null);
    setDragOverColumn(null);

    // Optimistic update in Redux.
    dispatch(
      moveCardOptimistic({
        cardId,
        fromListId: fromColumn,
        toListId: toColumn,
        newPosition: 'optimistic', // Real position is computed server-side.
      }),
    );

    try {
      await api.patch(`/cards/${cardId}/move`, { targetListId: toColumn });
      // Refetch to get authoritative positions.
      dispatch(fetchHydratedBoard(board.id));
    } catch {
      // Rollback — refetch the board.
      dispatch(fetchHydratedBoard(board.id));
    }
  };

  // ---------------------------------------------------------------------------
  // Add card — POST to API then refetch
  // ---------------------------------------------------------------------------

  const handleAddCard = async (
    columnId: string,
    title: string,
    priority: Priority,
    description?: string,
    tags?: string[],
    dueDate?: string,
  ) => {
    if (!board) return;
    const backendPriority = priority === 'critical' ? 'urgent' : priority;
    try {
      await api.post(`/lists/${columnId}/cards`, {
        title,
        priority: backendPriority,
        description,
        tags,
        dueDate: dueDate || undefined,
      });
      dispatch(fetchHydratedBoard(board.id));
    } catch (err) {
      console.error('Failed to create card:', err);
    }
  };

  // ---------------------------------------------------------------------------
  // Delete card — DELETE then refetch
  // ---------------------------------------------------------------------------

  const handleDeleteCard = async (_columnId: string, cardId: string) => {
    if (!board) return;
    try {
      await api.delete(`/cards/${cardId}`);
      dispatch(fetchHydratedBoard(board.id));
    } catch (err) {
      console.error('Failed to delete card:', err);
    }
  };

  // ---------------------------------------------------------------------------
  // Add column (list) — POST then refetch
  // ---------------------------------------------------------------------------

  const handleAddColumn = async () => {
    const title = newColumnTitle.trim();
    if (!title || !board) return;
    setColumnLoading(true);
    try {
      await api.post(`/boards/${board.id}/lists`, { title });
      dispatch(fetchHydratedBoard(board.id));
      setNewColumnTitle('');
      setAddingColumn(false);
    } catch (err) {
      console.error('Failed to create list:', err);
    } finally {
      setColumnLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Search filter
  // ---------------------------------------------------------------------------

  const filteredColumns = search
    ? columns.map((col) => ({
        ...col,
        cards: col.cards.filter(
          (c) =>
            c.title.toLowerCase().includes(search.toLowerCase()) ||
            c.tags.some((t) => t.toLowerCase().includes(search.toLowerCase())),
        ),
      }))
    : columns;

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  const boardAreaLoading =
    wsStatus === 'loading' ||
    (wsStatus === 'succeeded' && boardsStatus === 'loading') ||
    (hydrateStatus === 'loading' && !board);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundImage: `url(${boardBg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
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

            <WorkspaceBoardSelector />

            <nav className="hidden md:flex items-center gap-1">
              {(['Board', 'Timeline', 'Calendar', 'Reports'] as TabView[]).map((item) => (
                <button
                  key={item}
                  onClick={() => setActiveTab(item)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    activeTab === item
                      ? 'bg-primary/15 text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
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
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search cards..."
                className="bg-secondary border border-border rounded-lg pl-8 pr-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors w-44 focus:w-56"
              />
            </div>
            <button className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
              <Filter className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowInvite(true)}
              className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              title="Invite members"
            >
              <UserPlus className="w-4 h-4" />
            </button>
            <button className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground relative">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-destructive rounded-full" />
            </button>
            <button className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
              <Settings className="w-4 h-4" />
            </button>
            <div className="relative ml-1">
              <button
                onClick={() => setShowProfileMenu((v) => !v)}
                className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-accent-foreground"
                title={authUser?.name ?? 'User'}
              >
                {authUser?.name?.[0]?.toUpperCase() ?? <User className="w-4 h-4" />}
              </button>
              {showProfileMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowProfileMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 z-50 w-52 bg-popover border border-border rounded-xl shadow-2xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-border/60">
                      <p className="text-sm font-semibold text-foreground truncate">{authUser?.name ?? 'User'}</p>
                      <p className="text-xs text-muted-foreground truncate">{authUser?.email ?? ''}</p>
                    </div>
                    <button
                      onClick={() => { setShowProfileMenu(false); dispatch(logout()); }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Board header bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">
              {board?.title ?? 'Select a board'}
            </h1>
            <p className="text-xs text-muted-foreground font-mono-display mt-0.5 tracking-wide">
              {board ? `${board.members.length} MEMBER${board.members.length !== 1 ? 'S' : ''}` : ''}
            </p>
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
            <PresenceAvatars />
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
        {activeTab === 'Board' && (
          <div className="flex-1 overflow-x-auto scrollbar-thin px-6 py-6">
            {boardAreaLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : !board ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
                <p className="text-sm">Select or create a board to get started.</p>
              </div>
            ) : columns.length > 0 ? (
              <div className="flex gap-5 items-start pb-6" style={{ minWidth: 'max-content' }}>
                {filteredColumns.map((col) => (
                  <KanbanColumn
                    key={col.id}
                    column={col}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onAddCard={handleAddCard}
                    onDeleteCard={handleDeleteCard}
                    isDragOver={dragOverColumn === col.id}
                    onCardClick={setSelectedCardId}
                  />
                ))}
                {addingColumn ? (
                  <div className="w-72 shrink-0 rounded-2xl border-2 border-primary/40 bg-card p-4 space-y-3">
                    <input
                      ref={columnInputRef}
                      autoFocus
                      value={newColumnTitle}
                      onChange={(e) => setNewColumnTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddColumn();
                        if (e.key === 'Escape') { setAddingColumn(false); setNewColumnTitle(''); }
                      }}
                      placeholder="Column name..."
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors"
                      disabled={columnLoading}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleAddColumn}
                        disabled={!newColumnTitle.trim() || columnLoading}
                        className="flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-40 transition-all"
                      >
                        {columnLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                        Add Column
                      </button>
                      <button
                        onClick={() => { setAddingColumn(false); setNewColumnTitle(''); }}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingColumn(true)}
                    className="w-72 shrink-0 h-20 rounded-2xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-muted-foreground hover:text-primary flex items-center justify-center gap-2 text-sm font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Add Column
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-4">
                <p className="text-sm">No lists yet. Add a column to get started.</p>
                {addingColumn ? (
                  <div className="w-80 rounded-2xl border-2 border-primary/40 bg-card p-4 space-y-3">
                    <input
                      autoFocus
                      value={newColumnTitle}
                      onChange={(e) => setNewColumnTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddColumn();
                        if (e.key === 'Escape') { setAddingColumn(false); setNewColumnTitle(''); }
                      }}
                      placeholder="Column name..."
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors"
                      disabled={columnLoading}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleAddColumn}
                        disabled={!newColumnTitle.trim() || columnLoading}
                        className="flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-40 transition-all"
                      >
                        {columnLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                        Add Column
                      </button>
                      <button
                        onClick={() => { setAddingColumn(false); setNewColumnTitle(''); }}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingColumn(true)}
                    className="flex items-center gap-2 bg-primary text-primary-foreground text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
                  >
                    <Plus className="w-4 h-4" />
                    Add Column
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'Timeline' && <TimelineView columns={columns} />}
        {activeTab === 'Calendar' && <CalendarView columns={columns} />}
        {activeTab === 'Reports' && <ReportsView columns={columns} />}

        {/* Bottom status bar */}
        <footer className="flex items-center justify-between px-6 py-2.5 border-t border-border bg-card/40 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-mono-display tracking-wide">
              {totalCards > 0 ? `${Math.round((doneCards / totalCards) * 100)}% COMPLETE` : '0% COMPLETE'}
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <div className="h-1.5 w-48 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${totalCards > 0 ? Math.round((doneCards / totalCards) * 100) : 0}%` }}
              />
            </div>
          </div>
          <span className="text-[10px] text-muted-foreground font-mono-display">TASKSYNC v1.0</span>
        </footer>

        {/* New Card Dialog */}
        <NewCardDialog
          open={showNewCard}
          onClose={() => setShowNewCard(false)}
          columns={columns}
          onAdd={handleAddCard}
        />

        {/* Card Detail Drawer */}
        <CardDetailDrawer
          card={selectedCard}
          onClose={() => setSelectedCardId(null)}
        />

        {/* Invite Member Dialog */}
        <InviteMemberDialog
          open={showInvite}
          onClose={() => setShowInvite(false)}
        />
      </div>
    </div>
  );
};

export default Index;
