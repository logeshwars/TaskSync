import { PartialType } from '@nestjs/swagger';

import { CreateWorkspaceDto } from './create-workspace.dto';

/**
 * `PartialType` produces a DTO where every field becomes optional and the
 * Swagger metadata + class-validator decorators are inherited automatically.
 * This is the canonical NestJS pattern — never hand-rewrite the field list.
 */
export class UpdateWorkspaceDto extends PartialType(CreateWorkspaceDto) {}
