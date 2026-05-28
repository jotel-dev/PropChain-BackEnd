import { Body, Controller, Get, Post, Put, Delete, Param, Query, UseGuards } from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { CreatePropertyDto, UpdatePropertyDto } from './dto/property.dto';
import { AssignAgentDto, UpdateAgentAssignmentDto } from './dto/agent-assignment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import { UserRole } from '../types/prisma.types';
import {
  BulkPropertyStatusUpdateDto,
  BulkPropertyDeleteDto,
  BulkPropertyExportDto,
} from './dto/bulk-operations.dto';

@Controller('properties')
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() createPropertyDto: CreatePropertyDto, @CurrentUser() user: AuthUserPayload) {
    return this.propertiesService.create(createPropertyDto, user.sub);
  }

  @Get()
  findAll() {
    return this.propertiesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.propertiesService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.AGENT, UserRole.ADMIN)
  @Put(':id')
  update(@Param('id') id: string, @Body() updatePropertyDto: UpdatePropertyDto) {
    return this.propertiesService.update(id, updatePropertyDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.propertiesService.remove(id);
  }

  @Post('bulk/status')
  async bulkUpdatePropertyStatus(
    @Body() body: BulkPropertyStatusUpdateDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.propertiesService.bulkUpdatePropertyStatus(body.propertyIds, body.status);
  }

  @Post('bulk/delete')
  async bulkDeleteProperties(
    @Body() body: BulkPropertyDeleteDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.propertiesService.bulkDeleteProperties(body.propertyIds);
  }

  @Post('bulk/export')
  async bulkExportProperties(
    @Body() body: BulkPropertyExportDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.propertiesService.bulkExportProperties(body.propertyIds, body.filter);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/agents')
  async assignAgent(
    @Param('id') propertyId: string,
    @Body() dto: AssignAgentDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.propertiesService.assignAgent(propertyId, dto, user);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id/agents/:agentId')
  async updateAgentAssignment(
    @Param('id') propertyId: string,
    @Param('agentId') agentId: string,
    @Body() dto: UpdateAgentAssignmentDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.propertiesService.updateAgentAssignment(propertyId, agentId, dto, user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/agents/:agentId')
  async removeAgentAssignment(
    @Param('id') propertyId: string,
    @Param('agentId') agentId: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.propertiesService.removeAgentAssignment(propertyId, agentId, user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/agents')
  async getAgents(@Param('id') propertyId: string, @CurrentUser() user: AuthUserPayload) {
    return this.propertiesService.getAgents(propertyId, user);
  }
}
