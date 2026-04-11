/**
 * Board schema.
 *
 * A board is a Kanban surface that lives inside a workspace. It owns its
 * own membership list — typically the same as its parent workspace, but
 * boards can be tightened (e.g. a private "Q4 planning" board inside an
 * open workspace) or loosened (e.g. a "guest contractors" board with
 * extra members not in the workspace).
 *
 * Modelling notes:
 *   - `listOrder` is an array of List ObjectIds. We store the order on the
 *     board (rather than computing it from a `position` field on each
 *     list) so reordering is a single document update — atomic, no race.
 *   - `members` mirrors `Workspace.members` for the same reason: small
 *     teams, single fetch, easy to reason about. If a board ever needs
 *     hundreds of members we'll switch to a dedicated collection.
 *   - Lists and cards live in their own collections (not embedded). The
 *     hydrated read in BoardsService merges them into a single response.
 */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import type { Role } from '../../auth/decorators/roles.decorator';

export type BoardDocument = HydratedDocument<Board>;

@Schema({ _id: false })
export class BoardMember {
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

const BoardMemberSchema = SchemaFactory.createForClass(BoardMember);

@Schema({ timestamps: true, collection: 'boards' })
export class Board {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, minlength: 1, maxlength: 120 })
  title!: string;

  @Prop({ type: String, trim: true, maxlength: 1000 })
  description?: string;

  /**
   * Optional visual accent (hex string). The frontend uses this for the
   * board card on the dashboard. Stored as freeform string with a length
   * cap to keep validation simple.
   */
  @Prop({ type: String, maxlength: 32 })
  color?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;

  @Prop({ type: [BoardMemberSchema], default: [] })
  members!: BoardMember[];

  /**
   * Ordered list of List ObjectIds. The lists collection is the source
   * of truth for what lists exist; this array is the source of truth for
   * the order they should be rendered in.
   */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'List' }], default: [] })
  listOrder!: Types.ObjectId[];

  /**
   * Soft-delete sentinel. Archived boards are hidden from the dashboard
   * but kept around for audit / undo. Hard delete is a separate operation.
   */
  @Prop({ type: Date, default: null })
  archivedAt!: Date | null;
}

export const BoardSchema = SchemaFactory.createForClass(Board);

// "Boards I'm a member of" — used by the dashboard query.
BoardSchema.index({ 'members.userId': 1 });
// Workspace dashboards filter boards by parent workspace.
BoardSchema.index({ workspaceId: 1, archivedAt: 1 });
