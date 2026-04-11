/**
 * Workspace schema.
 *
 * A workspace is the top-level container for a team — it owns boards and
 * holds the membership list. Boards inherit a workspace's membership but
 * can also have a tighter, board-specific override (Phase 3 board schema).
 *
 * Modelling notes:
 *   - Members are stored as an embedded sub-document array. With small
 *     teams (typically < 100 members per workspace) this beats a separate
 *     collection: one query to fetch the workspace gives you the whole
 *     access list. If we ever support enterprise tenants we should split
 *     this out into a `workspace_members` collection keyed by `(workspaceId,
 *     userId)` for sparse updates.
 *   - `slug` is a URL-friendly handle that the frontend uses in routes
 *     instead of the raw ObjectId. We index it unique so collisions are
 *     impossible.
 *   - Boards are NOT embedded — they live in their own collection and
 *     reference `workspaceId`. This keeps the workspace document small
 *     and avoids hot-spot rewrites whenever a board changes.
 */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import type { Role } from '../../auth/decorators/roles.decorator';

export type WorkspaceDocument = HydratedDocument<Workspace>;

/**
 * Sub-document representing one user's membership in a workspace.
 *
 * `_id: false` because the (workspaceId, userId) pair is the natural key —
 * letting Mongoose generate a per-member ObjectId would just be noise.
 */
@Schema({ _id: false })
export class WorkspaceMember {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['owner', 'admin', 'member', 'viewer'],
    required: true,
  })
  role!: Role;

  @Prop({ type: Date, default: () => new Date() })
  joinedAt!: Date;
}

const WorkspaceMemberSchema = SchemaFactory.createForClass(WorkspaceMember);

@Schema({ timestamps: true, collection: 'workspaces' })
export class Workspace {
  @Prop({ type: String, required: true, trim: true, minlength: 2, maxlength: 80 })
  name!: string;

  @Prop({
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    minlength: 2,
    maxlength: 60,
    // Lower-case alphanumerics + dashes only — keeps URLs predictable.
    match: /^[a-z0-9-]+$/,
    unique: true,
    index: true,
  })
  slug!: string;

  @Prop({ type: String, trim: true, maxlength: 500 })
  description?: string;

  /**
   * Convenience pointer to the original creator. The same user is also
   * present in `members` with role: 'owner' — `ownerId` is duplicated for
   * fast filtering ("workspaces I own") without needing an `$elemMatch`.
   */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  ownerId!: Types.ObjectId;

  @Prop({ type: [WorkspaceMemberSchema], default: [] })
  members!: WorkspaceMember[];
}

export const WorkspaceSchema = SchemaFactory.createForClass(Workspace);

// Compound index that powers "workspaces this user belongs to" queries.
// Without this, the dashboard query would table-scan the collection.
WorkspaceSchema.index({ 'members.userId': 1 });
