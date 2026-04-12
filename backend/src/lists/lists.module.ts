import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { BoardsModule } from '../boards/boards.module';
import { ListAccessGuard } from './guards/list-access.guard';
import { ListsController } from './lists.controller';
import { ListsService } from './lists.service';
import { List, ListSchema } from './schemas/list.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: List.name, schema: ListSchema }]),
    forwardRef(() => BoardsModule),
  ],
  controllers: [ListsController],
  providers: [ListsService, ListAccessGuard],
  exports: [ListsService, ListAccessGuard],
})
export class ListsModule {}
