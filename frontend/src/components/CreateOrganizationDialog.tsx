/**
 * Create organization (workspace) dialog.
 *
 * Two-step modal: Step 1 collects org name, Step 2 lets user add members
 * before creating the workspace. Handles creating the workspace and
 * inviting members in sequence.
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Loader2, Plus, Users, X } from 'lucide-react';

import { api } from '@/lib/api';
import { useAppDispatch } from '@/store';
import {
  createWorkspace,
  fetchWorkspaces,
} from '@/store/workspaces.slice';
import { clearActiveBoard, fetchBoards } from '@/store/boards.slice';

type InviteRole = 'admin' | 'member' | 'viewer';

interface PendingInvite {
  id: string;
  email: string;
  role: InviteRole;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CreateOrganizationDialog({ open, onClose }: Props) {
  const dispatch = useAppDispatch();

  // Form states.
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [roleInput, setRoleInput] = useState<InviteRole>('member');
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);

  // Submission state.
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Input refs for auto-focus.
  const nameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  // Focus inputs when dialog/step changes.
  useEffect(() => {
    if (open && step === 1) nameInputRef.current?.focus();
  }, [open, step]);

  useEffect(() => {
    if (open && step === 2) emailInputRef.current?.focus();
  }, [step]);

  // Reset form when dialog closes.
  useEffect(() => {
    if (!open) {
      setStep(1);
      setName('');
      setEmailInput('');
      setRoleInput('member');
      setPendingInvites([]);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleAddMember = () => {
    const email = emailInput.trim().toLowerCase();
    if (!email) return;

    // Validate email format.
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Invalid email format');
      return;
    }

    // Check for duplicates.
    if (pendingInvites.some((m) => m.email === email)) {
      setError('This email is already in the invite list');
      return;
    }

    const newInvite: PendingInvite = {
      id: `${Date.now()}-${Math.random()}`,
      email,
      role: roleInput,
    };
    setPendingInvites([...pendingInvites, newInvite]);
    setEmailInput('');
    setRoleInput('member');
    setError(null);
    emailInputRef.current?.focus();
  };

  const handleRemoveMember = (id: string) => {
    setPendingInvites(pendingInvites.filter((m) => m.id !== id));
  };

  const handleContinue = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Organization name is required');
      return;
    }
    setError(null);
    setStep(2);
  };

  const handleCreateWorkspace = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Organization name is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Step 1: Create workspace.
      const ws = await dispatch(createWorkspace({ name: trimmedName })).unwrap();

      // Step 2: Invite members sequentially.
      for (const invite of pendingInvites) {
        try {
          await api.post(`/workspaces/${ws.slug}/members`, {
            email: invite.email,
            role: invite.role,
          });
        } catch (err: any) {
          const msg = err?.response?.data?.message;
          const errorMsg = typeof msg === 'string' ? msg : Array.isArray(msg) ? msg.join(', ') : `Failed to invite ${invite.email}`;
          console.error(errorMsg, err);
          // Continue with other invites even if one fails.
        }
      }

      // Step 3: Refresh state.
      dispatch(clearActiveBoard());
      dispatch(fetchBoards(ws.slug));
      await dispatch(fetchWorkspaces());

      // Close dialog.
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError(typeof msg === 'string' ? msg : Array.isArray(msg) ? msg.join(', ') : 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  };

  const roleColors: Record<string, string> = {
    admin: 'bg-purple-500/15 text-purple-500 border-purple-500/30',
    member: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
    viewer: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 min-h-screen">
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            {step === 2 && (
              <button
                onClick={() => setStep(1)}
                disabled={loading}
                className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <div className={step === 2 ? '' : 'w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center'}>
              {step === 1 ? (
                <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                  <Users className="w-4 h-4 text-primary" />
                </div>
              ) : null}
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground tracking-tight">
                {step === 1 ? 'Create Organization' : 'Add Members'}
              </h2>
              <p className="text-[10px] text-muted-foreground font-mono-display tracking-wider">
                {step === 1 ? 'Step 1 of 2' : 'Step 2 of 2'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        {step === 1 ? (
          <div className="px-6 py-4 space-y-4">
            <div>
              <label className="text-[10px] font-mono-display font-bold tracking-widest text-muted-foreground uppercase block mb-2">
                Organization Name
              </label>
              <input
                ref={nameInputRef}
                value={name}
                onChange={(e) => { setName(e.target.value); setError(null); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleContinue();
                  if (e.key === 'Escape') onClose();
                }}
                placeholder="My Company"
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors"
                disabled={loading}
              />
            </div>

            {error && (
              <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={onClose}
                disabled={loading}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-muted text-foreground rounded-xl hover:opacity-90 disabled:opacity-40 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleContinue}
                disabled={!name.trim() || loading}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-primary text-primary-foreground rounded-xl hover:opacity-90 disabled:opacity-40 transition-all"
              >
                Continue
              </button>
            </div>
          </div>
        ) : (
          <div className="px-6 py-4 space-y-4 max-h-96 overflow-y-auto">
            {/* Members input form */}
            <div className="space-y-2">
              <label className="text-[10px] font-mono-display font-bold tracking-widest text-muted-foreground uppercase">
                Invite Members
              </label>
              <div className="flex gap-2">
                <input
                  ref={emailInputRef}
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddMember();
                  }}
                  placeholder="teammate@example.com"
                  className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors"
                  disabled={loading}
                />
                <select
                  value={roleInput}
                  onChange={(e) => setRoleInput(e.target.value as InviteRole)}
                  className="bg-secondary border border-border rounded-xl px-2.5 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors cursor-pointer"
                  disabled={loading}
                >
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button
                  onClick={handleAddMember}
                  disabled={!emailInput.trim() || loading}
                  className="px-3 py-2 bg-secondary border border-border rounded-xl hover:bg-muted disabled:opacity-40 transition-colors text-muted-foreground hover:text-foreground flex items-center justify-center"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">{error}</p>
            )}

            {/* Pending invites list */}
            <div>
              <label className="text-[10px] font-mono-display font-bold tracking-widest text-muted-foreground uppercase block mb-2">
                Members to Invite ({pendingInvites.length})
              </label>
              {pendingInvites.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No members added yet</p>
              ) : (
                <div className="space-y-2">
                  {pendingInvites.map((invite) => (
                    <div key={invite.id} className="flex items-center justify-between bg-secondary rounded-lg px-3 py-2 border border-border/50">
                      <div>
                        <p className="text-sm text-foreground">{invite.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-mono-display font-bold tracking-wider px-2 py-0.5 rounded-full border ${roleColors[invite.role]}`}>
                          {invite.role.toUpperCase()}
                        </span>
                        <button
                          onClick={() => handleRemoveMember(invite.id)}
                          disabled={loading}
                          className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-2 border-t border-border/50">
              <button
                onClick={() => setStep(1)}
                disabled={loading}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-muted text-foreground rounded-xl hover:opacity-90 disabled:opacity-40 transition-all"
              >
                Back
              </button>
              <button
                onClick={handleCreateWorkspace}
                disabled={!name.trim() || loading}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold bg-primary text-primary-foreground rounded-xl hover:opacity-90 disabled:opacity-40 transition-all"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create Organization
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
