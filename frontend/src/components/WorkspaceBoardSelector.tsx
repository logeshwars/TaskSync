/**
 * Workspace & board selector with inline create flows.
 *
 * Sits in the header area. Shows the current workspace in a dropdown
 * and lists boards underneath. Selecting a board dispatches
 * `fetchHydratedBoard` which populates the kanban view.
 *
 * Both dropdowns include a "New ..." row that toggles an inline form —
 * no separate dialog needed for these quick-create actions.
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Layout, Loader2, Plus } from 'lucide-react';

import { useAppDispatch, useAppSelector } from '@/store';
import {
  createBoard,
  fetchBoards,
  fetchHydratedBoard,
  clearActiveBoard,
  type BoardSummary,
} from '@/store/boards.slice';
import {
  createWorkspace,
  fetchWorkspaces,
  selectWorkspace,
  type Workspace,
} from '@/store/workspaces.slice';

export function WorkspaceBoardSelector() {
  const dispatch = useAppDispatch();
  const { items: workspaces, selectedId: wsId } = useAppSelector((s) => s.workspaces);
  const { items: boards, active } = useAppSelector((s) => s.boards);
  const [wsOpen, setWsOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);

  // Inline create states.
  const [creatingWs, setCreatingWs] = useState(false);
  const [wsName, setWsName] = useState('');
  const [wsLoading, setWsLoading] = useState(false);
  const wsInputRef = useRef<HTMLInputElement>(null);

  const [creatingBoard, setCreatingBoard] = useState(false);
  const [boardTitle, setBoardTitle] = useState('');
  const [boardLoading, setBoardLoading] = useState(false);
  const boardInputRef = useRef<HTMLInputElement>(null);

  const selectedWs = workspaces.find((w) => w.id === wsId);

  // Fetch workspaces once on mount.
  useEffect(() => {
    dispatch(fetchWorkspaces());
  }, [dispatch]);

  // When the selected workspace changes, fetch its boards.
  useEffect(() => {
    if (selectedWs) {
      dispatch(fetchBoards(selectedWs.slug));
    }
  }, [dispatch, selectedWs]);

  // Auto-select the first board when boards load and nothing is active.
  useEffect(() => {
    if (boards.length > 0 && !active) {
      dispatch(fetchHydratedBoard(boards[0].id));
    }
  }, [dispatch, boards, active]);

  // Focus input when inline create form appears.
  useEffect(() => {
    if (creatingWs) wsInputRef.current?.focus();
  }, [creatingWs]);
  useEffect(() => {
    if (creatingBoard) boardInputRef.current?.focus();
  }, [creatingBoard]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleSelectWorkspace = (ws: Workspace) => {
    dispatch(selectWorkspace(ws.id));
    dispatch(clearActiveBoard());
    setWsOpen(false);
    setCreatingWs(false);
  };

  const handleSelectBoard = (board: BoardSummary) => {
    dispatch(fetchHydratedBoard(board.id));
    setBoardOpen(false);
    setCreatingBoard(false);
  };

  const handleCreateWorkspace = async () => {
    const name = wsName.trim();
    if (!name) return;
    setWsLoading(true);
    try {
      const result = await dispatch(createWorkspace({ name })).unwrap();
      // After creation the thunk auto-selects the new workspace.
      // Clear active board so boards refetch for the new workspace.
      dispatch(clearActiveBoard());
      setWsName('');
      setCreatingWs(false);
      setWsOpen(false);
      // Fetch boards for the newly created workspace.
      dispatch(fetchBoards(result.slug));
    } catch {
      // Stay open so user can retry.
    } finally {
      setWsLoading(false);
    }
  };

  const handleCreateBoard = async () => {
    const title = boardTitle.trim();
    if (!title || !selectedWs) return;
    setBoardLoading(true);
    try {
      const result = await dispatch(
        createBoard({ workspaceSlug: selectedWs.slug, title }),
      ).unwrap();
      setBoardTitle('');
      setCreatingBoard(false);
      setBoardOpen(false);
      // Open the newly created board.
      dispatch(fetchHydratedBoard(result.id));
    } catch {
      // Stay open so user can retry.
    } finally {
      setBoardLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* Workspace picker */}
      <div className="relative">
        <button
          onClick={() => { setWsOpen(!wsOpen); setBoardOpen(false); }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-secondary border border-border hover:border-primary/40 transition-colors text-foreground"
        >
          <Layout className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="max-w-[120px] truncate">{selectedWs?.name ?? 'Workspace'}</span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        {wsOpen && (
          <div className="absolute left-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-2xl py-1 w-56">
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => handleSelectWorkspace(ws)}
                className={`w-full text-left px-3 py-1.5 text-sm transition-colors hover:bg-muted ${
                  ws.id === wsId ? 'text-primary font-medium' : 'text-foreground'
                }`}
              >
                {ws.name}
              </button>
            ))}
            {workspaces.length === 0 && !creatingWs && (
              <p className="px-3 py-2 text-xs text-muted-foreground">No workspaces yet</p>
            )}

            <div className="border-t border-border mt-1 pt-1">
              {creatingWs ? (
                <div className="px-3 py-2 flex items-center gap-2">
                  <input
                    ref={wsInputRef}
                    value={wsName}
                    onChange={(e) => setWsName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateWorkspace();
                      if (e.key === 'Escape') { setCreatingWs(false); setWsName(''); }
                    }}
                    placeholder="Organization name..."
                    className="flex-1 bg-secondary border border-border rounded-lg px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors"
                    disabled={wsLoading}
                  />
                  <button
                    onClick={handleCreateWorkspace}
                    disabled={!wsName.trim() || wsLoading}
                    className="px-2.5 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-40 transition-all flex items-center gap-1"
                  >
                    {wsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    Add
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setCreatingWs(true)}
                  className="w-full text-left px-3 py-1.5 text-sm text-muted-foreground hover:text-primary hover:bg-muted transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Organization
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Board picker */}
      <div className="relative">
        <button
          onClick={() => { setBoardOpen(!boardOpen); setWsOpen(false); }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-secondary border border-border hover:border-primary/40 transition-colors text-foreground"
        >
          <span className="max-w-[140px] truncate">{active?.title ?? 'Board'}</span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        {boardOpen && (
          <div className="absolute left-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-2xl py-1 w-56">
            {boards.map((b) => (
              <button
                key={b.id}
                onClick={() => handleSelectBoard(b)}
                className={`w-full text-left px-3 py-1.5 text-sm transition-colors hover:bg-muted ${
                  active?.id === b.id ? 'text-primary font-medium' : 'text-foreground'
                }`}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full mr-2"
                  style={{ backgroundColor: b.color || '#6366f1' }}
                />
                {b.title}
              </button>
            ))}
            {boards.length === 0 && !creatingBoard && (
              <p className="px-3 py-2 text-xs text-muted-foreground">No boards yet</p>
            )}

            <div className="border-t border-border mt-1 pt-1">
              {creatingBoard ? (
                <div className="px-3 py-2 flex items-center gap-2">
                  <input
                    ref={boardInputRef}
                    value={boardTitle}
                    onChange={(e) => setBoardTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateBoard();
                      if (e.key === 'Escape') { setCreatingBoard(false); setBoardTitle(''); }
                    }}
                    placeholder="Board name..."
                    className="flex-1 bg-secondary border border-border rounded-lg px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors"
                    disabled={boardLoading}
                  />
                  <button
                    onClick={handleCreateBoard}
                    disabled={!boardTitle.trim() || boardLoading}
                    className="px-2.5 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-40 transition-all flex items-center gap-1"
                  >
                    {boardLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    Add
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { if (!selectedWs) return; setCreatingBoard(true); }}
                  className={`w-full text-left px-3 py-1.5 text-sm transition-colors flex items-center gap-1.5 ${
                    selectedWs
                      ? 'text-muted-foreground hover:text-primary hover:bg-muted'
                      : 'text-muted-foreground/40 cursor-not-allowed'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Board
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
