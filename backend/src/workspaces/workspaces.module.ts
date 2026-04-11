import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { UsersModule } from '../users/users.module';
import { WorkspaceMemberGuard } from './guards/workspace-member.guard';
import { Workspace, WorkspaceSchema } from './schemas/workspace.schema';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';

/**
 * Workspaces module.
 *
 * Exports:
 *   - `WorkspacesService` so the boards module can verify a board's parent
 *     workspace exists and resolve membership for board-level guards.
 *   - `WorkspaceMemberGuard` so other modules (like boards) can compose it.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Workspace.name, schema: WorkspaceSchema }]),
    UsersModule,
  ],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspaceMemberGuard],
  exports: [WorkspacesService, WorkspaceMemberGuard],
})
export class WorkspacesModule {}
