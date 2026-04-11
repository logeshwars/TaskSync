import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { UsersModule } from '../users/users.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';
import { BoardMemberGuard } from './guards/board-member.guard';
import { Board, BoardSchema } from './schemas/board.schema';

/**
 * Boards module.
 *
 * Imports WorkspacesModule for `WorkspacesService` (used by the role
 * fall-through) and UsersModule for email-based member invites. Exports
 * BoardsService + BoardMemberGuard so future modules (lists, cards,
 * comments) can compose them when guarding their own routes.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Board.name, schema: BoardSchema }]),
    WorkspacesModule,
    UsersModule,
  ],
  controllers: [BoardsController],
  providers: [BoardsService, BoardMemberGuard],
  exports: [BoardsService, BoardMemberGuard],
})
export class BoardsModule {}
