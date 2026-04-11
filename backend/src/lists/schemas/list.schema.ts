/**
 * List schema (Kanban column).
 *
 * A list belongs to exactly one board and holds an ordered array of card
 * ids. Notes:
 *
 *   - We keep `cardOrder` as the source of truth for card position within
 *     a list, so reordering is a single document update — no per-card
 *     `position` field to keep in sync.
 *   - The list itself has a `position` (a sortable string) so multiple
 *     lists on the same board can be reordered without rewriting the
 *     entire `Board.listOrder` array. We support BOTH the array on the
 *     parent (atomic, easy to render) AND a position field (stable for
 *     concurrent inserts).
 *   - `wipLimit` is optional. When set, the cards module enforces it on
 *     create/move into this list.
 */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ListDocument = HydratedDocument<List>;

@Schema({ timestamps: true, collection: 'lists' })
export class List {
  @Prop({ type: Types.ObjectId, ref: 'Board', required: true, index: true })
  boardId!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, minlength: 1, maxlength: 100 })
  title!: string;

  /**
   * LexoRank-style sortable position. We use a string (rather than a
   * float) so we can insert "between" two existing positions indefinitely
   * without ever running out of precision. The cards module follows the
   * same convention.
   */
  @Prop({ type: String, required: true, index: true })
  position!: string;

  /**
   * Optional Work-In-Progress cap. `null` (default) means no limit.
   * The cards module reads this when accepting create / move requests.
   */
  @Prop({ type: Number, min: 1, default: null })
  wipLimit!: number | null;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Card' }], default: [] })
  cardOrder!: Types.ObjectId[];

  @Prop({ type: Date, default: null })
  archivedAt!: Date | null;
}

export const ListSchema = SchemaFactory.createForClass(List);

// Sorting "lists in this board" hits this composite index.
ListSchema.index({ boardId: 1, position: 1 });
