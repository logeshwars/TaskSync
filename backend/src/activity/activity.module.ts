import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { BoardsModule } from '../boards/boards.module';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';
import { Activity, ActivitySchema } from './schemas/activity.schema';

/**
 * Activity module.
 *
 * `@Global()` so ActivityService is injectable from any feature module
 * (cards, lists, comments, boards) without each one re-importing the
 * module. Audit logging is a cross-cutting concern — this is exactly the
 * sort of case @Global() was added for.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Activity.name, schema: ActivitySchema }]),
    BoardsModule,
  ],
  controllers: [ActivityController],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
