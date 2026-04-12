import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { BoardsModule } from '../boards/boards.module';
import { ListsModule } from '../lists/lists.module';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';
import { CardAccessGuard } from './guards/card-access.guard';
import { Card, CardSchema } from './schemas/card.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Card.name, schema: CardSchema }]),
    forwardRef(() => BoardsModule),
    ListsModule,
  ],
  controllers: [CardsController],
  providers: [CardsService, CardAccessGuard],
  exports: [CardsService, CardAccessGuard],
})
export class CardsModule {}
