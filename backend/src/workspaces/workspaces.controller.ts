/**
 * Workspaces controller.
 *
 * Routes are split into two groups:
 *   1. Routes that don't target a specific workspace (`POST /workspaces`,
 *      `GET /workspaces`) — only need authentication.
 *   2. Routes that DO target a specific workspace (`/:slug/...`) — gated
 *      by `WorkspaceMemberGuard` + `RolesGuard` so we can declare the
 *      minimum required role per handler with `@Roles(...)`.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { WorkspaceResponseDto } from './dto/workspace.response.dto';
import { WorkspaceMemberGuard } from './guards/workspace-member.guard';
import {
  type WorkspaceDocument,
  type WorkspaceMember,
} from './schemas/workspace.schema';
import { WorkspacesService } from './workspaces.service';

@ApiTags('workspaces')
@ApiBearerAuth('access-token')
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  // ---------------------------------------------------------------------------
  // Top-level routes — no per-resource role check needed.
  // ---------------------------------------------------------------------------

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a workspace. The creator becomes its owner.' })
  @ApiCreatedResponse({ type: WorkspaceResponseDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkspaceDto,
  ): Promise<WorkspaceResponseDto> {
    const ws = await this.workspaces.create(user.id, dto);
    return this.toResponse(ws);
  }

  @Get()
  @ApiOperation({ summary: 'List the workspaces the authenticated user belongs to.' })
  @ApiOkResponse({ type: WorkspaceResponseDto, isArray: true })
  async listMine(@CurrentUser() user: AuthenticatedUser): Promise<WorkspaceResponseDto[]> {
    const list = await this.workspaces.findAllForUser(user.id);
    return list.map((ws) => this.toResponse(ws));
  }

  // ---------------------------------------------------------------------------
  // Per-workspace routes — guarded by membership + role.
  // ---------------------------------------------------------------------------

  @Get(':slug')
  @UseGuards(WorkspaceMemberGuard, RolesGuard)
  @Roles('owner', 'admin', 'member', 'viewer')
  @ApiOperation({ summary: 'Fetch a single workspace.' })
  @ApiOkResponse({ type: WorkspaceResponseDto })
  async findOne(@Param('slug') slug: string): Promise<WorkspaceResponseDto> {
    const ws = await this.workspaces.findBySlugOrThrow(slug);
    return this.toResponse(ws);
  }

  @Patch(':slug')
  @UseGuards(WorkspaceMemberGuard, RolesGuard)
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'Update workspace metadata. Owners and admins only.' })
  @ApiOkResponse({ type: WorkspaceResponseDto })
  async update(
    @Param('slug') slug: string,
    @Body() dto: UpdateWorkspaceDto,
  ): Promise<WorkspaceResponseDto> {
    const ws = await this.workspaces.update(slug, dto);
    return this.toResponse(ws);
  }

  @Delete(':slug')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(WorkspaceMemberGuard, RolesGuard)
  @Roles('owner')
  @ApiOperation({ summary: 'Delete a workspace. Owner only.' })
  @ApiNoContentResponse()
  async remove(@Param('slug') slug: string): Promise<void> {
    await this.workspaces.remove(slug);
  }

  // ---------------------------------------------------------------------------
  // Membership management
  // ---------------------------------------------------------------------------

  @Post(':slug/members')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(WorkspaceMemberGuard, RolesGuard)
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'Invite (add) a user by email to the workspace.' })
  @ApiCreatedResponse({ type: WorkspaceResponseDto })
  async invite(
    @Param('slug') slug: string,
    @Body() dto: InviteMemberDto,
  ): Promise<WorkspaceResponseDto> {
    const ws = await this.workspaces.addMemberByEmail(slug, dto.email, dto.role);
    return this.toResponse(ws);
  }

  @Patch(':slug/members/:userId')
  @UseGuards(WorkspaceMemberGuard, RolesGuard)
  @Roles('owner', 'admin')
  @ApiOperation({ summary: "Change a member's role." })
  @ApiOkResponse({ type: WorkspaceResponseDto })
  async updateMember(
    @Param('slug') slug: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto,
  ): Promise<WorkspaceResponseDto> {
    const ws = await this.workspaces.updateMemberRole(slug, userId, dto.role);
    return this.toResponse(ws);
  }

  @Delete(':slug/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(WorkspaceMemberGuard, RolesGuard)
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'Remove a member from the workspace.' })
  @ApiNoContentResponse()
  async removeMember(
    @Param('slug') slug: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    await this.workspaces.removeMember(slug, userId);
  }

  // ---------------------------------------------------------------------------
  // Mongoose document → API view-model.
  //
  // Done by hand (rather than class-transformer) so the shape is grep-able
  // and we never accidentally serialise an internal Mongoose key.
  // ---------------------------------------------------------------------------

  private toResponse(ws: WorkspaceDocument): WorkspaceResponseDto {
    return {
      id: ws._id.toString(),
      name: ws.name,
      slug: ws.slug,
      description: ws.description,
      ownerId: ws.ownerId.toString(),
      members: ws.members.map((m: WorkspaceMember) => ({
        userId: m.userId.toString(),
        role: m.role,
        joinedAt: m.joinedAt,
      })),
      createdAt: (ws as unknown as { createdAt: Date }).createdAt,
      updatedAt: (ws as unknown as { updatedAt: Date }).updatedAt,
    };
  }
}
