/**
 * Invite member dialog.
 *
 * Lets workspace owners/admins invite users by email. Also shows the
 * current member list with roles and a remove button.
 */
import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, UserPlus, X } from 'lucide-react';

import { api } from '@/lib/api';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchWorkspaces, type Workspace, type WorkspaceMember } from '@/store/workspaces.slice';

type InviteRole = 'admin' | 'member' | 'viewer';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function InviteMemberDialog({ open, onClose }: Props) {
  const dispatch = useAppDispatch();
  const { items: workspaces, selectedId } = useAppSelector((s) => s.workspaces);
  const workspace = workspaces.find((w) => w.id === selectedId);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InviteRole>('member');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [members, setMembers] = useState<(WorkspaceMember & { email?: string })[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // Sync members from workspace whenever it changes.
  useEffect(() => {
    if (workspace) {
      setMembers(workspace.members);
    }
  }, [workspace]);

  // Fetch fresh workspace data when dialog opens.
  useEffect(() => {
    if (open && workspace) {
      setMembersLoading(true);
      dispatch(fetchWorkspaces()).finally(() => setMembersLoading(false));
    }
    if (open) {
      setError(null);
      setSuccess(null);
      setEmail('');
    }
  }, [open, dispatch]);

  if (!open) return null;

  const handleInvite = async () => {
    const trimmed = email.trim();
    if (!trimmed || !workspace) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await api.post(`/workspaces/${workspace.slug}/members`, {
        email: trimmed,
        role,
      });
      setSuccess(`Invited ${trimmed} as ${role}`);
      setEmail('');
      // Refresh workspace data to update member list.
      dispatch(fetchWorkspaces());
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError(typeof msg === 'string' ? msg : Array.isArray(msg) ? msg.join(', ') : 'Failed to invite member.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (userId: string) => {
    if (!workspace) return;
    try {
      await api.delete(`/workspaces/${workspace.slug}/members/${userId}`);
      dispatch(fetchWorkspaces());
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError(typeof msg === 'string' ? msg : 'Failed to remove member.');
    }
  };

  const roleColors: Record<string, string> = {
    owner: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
    admin: 'bg-purple-500/15 text-purple-500 border-purple-500/30',
    member: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
    viewer: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md mx-4 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground tracking-tight">Manage Members</h2>
              <p className="text-[10px] text-muted-foreground font-mono-display tracking-wider">
                {workspace?.name?.toUpperCase() ?? 'WORKSPACE'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Invite form */}
        <div className="px-6 py-4 space-y-3 border-b border-border/60">
          <label className="text-[10px] font-mono-display font-bold tracking-widest text-muted-foreground uppercase">
            Invite by Email
          </label>
          <div className="flex gap-2">
            <input
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleInvite(); }}
              placeholder="teammate@example.com"
              className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors"
              disabled={loading}
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as InviteRole)}
              className="bg-secondary border border-border rounded-xl px-2.5 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors cursor-pointer"
              disabled={loading}
            >
              <option value="admin">Admin</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <button
            onClick={handleInvite}
            disabled={!email.trim() || loading}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-semibold px-4 py-2 rounded-xl hover:opacity-90 disabled:opacity-40 transition-all w-full justify-center"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Send Invite
          </button>

          {error && (
            <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">{error}</p>
          )}
          {success && (
            <p className="text-xs text-green-500 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">{success}</p>
          )}
        </div>

        {/* Current members */}
        <div className="px-6 py-4 max-h-64 overflow-y-auto">
          <label className="text-[10px] font-mono-display font-bold tracking-widest text-muted-foreground uppercase mb-3 block">
            Members ({members.length})
          </label>
          {membersLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2">
              {members.map((m) => (
                <div key={m.userId} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-[10px] font-bold text-accent-foreground">
                      {m.userId.slice(-2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm text-foreground leading-tight">{m.userId}</p>
                      <p className="text-[10px] text-muted-foreground">
                        Joined {new Date(m.joinedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-mono-display font-bold tracking-wider px-2 py-0.5 rounded-full border ${roleColors[m.role] ?? roleColors.member}`}>
                      {m.role.toUpperCase()}
                    </span>
                    {m.role !== 'owner' && (
                      <button
                        onClick={() => handleRemove(m.userId)}
                        className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        title="Remove member"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
