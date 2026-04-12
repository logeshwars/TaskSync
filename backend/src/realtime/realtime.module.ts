import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { BoardsModule } from '../boards/boards.module';
import type { AppConfig } from '../config/configuration';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

/**
 * Realtime module.
 *
 * `@Global()` so any feature service can inject `RealtimeService` without
 * re-importing. The gateway itself is not exported — callers go through
 * `RealtimeService` to stay decoupled from Socket.IO internals.
 *
 * We register a JwtModule instance with the access-token secret here so
 * the gateway can verify handshake tokens without borrowing the auth
 * module's JwtService (which is configured with empty options on purpose
 * — AuthService passes secrets per-call).
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: config.get('jwt', { infer: true }).accessSecret,
      }),
    }),
    BoardsModule,
  ],
  providers: [RealtimeGateway, RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
