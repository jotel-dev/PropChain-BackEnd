import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../database/prisma.service';
import { CreatePropertyDto, UpdatePropertyDto } from './dto/property.dto';
import { AssignAgentDto, UpdateAgentAssignmentDto } from './dto/agent-assignment.dto';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import { FraudService } from '../fraud/fraud.service';
import { PropertyStatus } from '../types/prisma.types';

interface FindAllParams {
  skip?: number;
  take?: number;
  where?: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'>;
}

@Injectable()
export class PropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fraudService: FraudService,
  ) {}

  async create(createPropertyDto: CreatePropertyDto, ownerId: string) {
    const { price, squareFeet, lotSize, ...rest } = createPropertyDto;

    const property = await this.prisma.property.create({
      data: {
        ...rest,
        price: new Decimal(price.toString()),
        squareFeet: squareFeet ? new Decimal(squareFeet.toString()) : null,
        lotSize: lotSize ? new Decimal(lotSize.toString()) : null,
        owner: {
          connect: { id: ownerId },
        },
      },
    });

    await this.fraudService.evaluatePropertyCreated(property.id);

    return property;
  }

  async findAll(params?: FindAllParams) {
    const { skip, take, where, orderBy } = params || {};
    return (this.prisma.property as any).findMany({
      skip,
      take,
      where,
      orderBy,
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        agents: {
          include: {
            agent: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        },
      },
    });
  }

  async findOne(id: string) {
    return (this.prisma.property as any).findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        documents: true,
        agents: {
          include: {
            agent: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        },
      },
    });
  }

  async update(id: string, updatePropertyDto: UpdatePropertyDto) {
    const { price, squareFeet, lotSize, ...rest } = updatePropertyDto;

    return this.prisma.property.update({
      where: { id },
      data: {
        ...rest,
        price: price ? new Decimal(price.toString()) : undefined,
        squareFeet: squareFeet ? new Decimal(squareFeet.toString()) : undefined,
        lotSize: lotSize ? new Decimal(lotSize.toString()) : undefined,
      },
    });
  }

  async remove(id: string) {
    return this.prisma.property.delete({
      where: { id },
    });
  }

  async findByOwnerId(ownerId: string) {
    return this.prisma.property.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async bulkUpdatePropertyStatus(
    propertyIds: string[],
    status: PropertyStatus,
  ): Promise<{ updatedCount: number }> {
    const validStatus =
      status === PropertyStatus.DRAFT
        ? 'DRAFT'
        : status === PropertyStatus.ARCHIVED
          ? 'ARCHIVED'
          : 'ACTIVE';

    const result = await this.prisma.property.updateMany({
      where: { id: { in: propertyIds } },
      data: { status: validStatus },
    });

    return { updatedCount: result.count };
  }

  async bulkDeleteProperties(propertyIds: string[]): Promise<{
    deletedCount: number;
    propertyIds: string[];
  }> {
    const result = await this.prisma.property.deleteMany({
      where: { id: { in: propertyIds } },
    });

    return {
      deletedCount: result.count,
      propertyIds,
    };
  }

  async bulkExportProperties(
    propertyIds: string[],
    filter?: string,
  ): Promise<{ total: number; data: Record<string, any>[] }> {
    const propertyWhere: Record<string, unknown> = { id: { in: propertyIds } };

    if (filter) {
      propertyWhere.title = { contains: filter, mode: 'insensitive' as const };
    }

    const properties = await (this.prisma.property as any).findMany({
      where: propertyWhere,
      select: {
        id: true,
        title: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        price: true,
        propertyType: true,
        bedrooms: true,
        bathrooms: true,
        squareFeet: true,
        lotSize: true,
        yearBuilt: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        ownerId: true,
        owner: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        agents: {
          include: {
            agent: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        },
      },
    });

    const exportData: Record<string, any>[] = properties.map((prop: Record<string, any>) => ({
      id: prop.id,
      title: prop.title,
      address: prop.address,
      city: prop.city,
      state: prop.state,
      zipCode: prop.zipCode,
      price: Number(prop.price),
      propertyType: prop.propertyType,
      bedrooms: prop.bedrooms,
      bathrooms: prop.bathrooms,
      squareFeet: prop.squareFeet,
      lotSize: prop.lotSize,
      yearBuilt: prop.yearBuilt,
      status: prop.status,
      ownerId: prop.ownerId,
      ownerEmail: prop.owner.email,
      ownerName: `${prop.owner.firstName} ${prop.owner.lastName}`,
      ownerPhone: prop.owner.phone,
      agents: (prop.agents || []).map((pa: any) => ({
        agentId: pa.agentId,
        name: `${pa.agent.firstName} ${pa.agent.lastName}`,
        email: pa.contactEmail || pa.agent.email,
        phone: pa.contactPhone || pa.agent.phone,
        commissionRate: Number(pa.commissionRate),
      })),
      createdAt: prop.createdAt,
      updatedAt: prop.updatedAt,
    }));

    return {
      total: exportData.length,
      data: exportData,
    };
  }

  async assignAgent(propertyId: string, dto: AssignAgentDto, user: AuthUserPayload) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) {
      throw new NotFoundException('Property not found');
    }

    if (user.role !== 'ADMIN' && property.ownerId !== user.sub) {
      throw new ForbiddenException('Only the property owner or an admin can assign agents');
    }

    const agent = await this.prisma.user.findUnique({
      where: { id: dto.agentId },
    });
    if (!agent) {
      throw new NotFoundException('Agent user not found');
    }
    if (agent.role !== 'AGENT') {
      throw new BadRequestException('Assigned user must have the AGENT role');
    }

    const existing = await (this.prisma as any).propertyAgent.findUnique({
      where: {
        propertyId_agentId: {
          propertyId,
          agentId: dto.agentId,
        },
      },
    });
    if (existing) {
      throw new BadRequestException('Agent is already assigned to this property');
    }

    return (this.prisma as any).propertyAgent.create({
      data: {
        propertyId,
        agentId: dto.agentId,
        commissionRate: dto.commissionRate !== undefined ? new Decimal(dto.commissionRate.toString()) : new Decimal('0.03'),
        contactPhone: dto.contactPhone ?? null,
        contactEmail: dto.contactEmail ?? null,
      },
      include: {
        agent: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
    });
  }

  async updateAgentAssignment(
    propertyId: string,
    agentId: string,
    dto: UpdateAgentAssignmentDto,
    user: AuthUserPayload,
  ) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) {
      throw new NotFoundException('Property not found');
    }

    if (user.role !== 'ADMIN' && property.ownerId !== user.sub) {
      throw new ForbiddenException('Only the property owner or an admin can update agent assignments');
    }

    const assignment = await (this.prisma as any).propertyAgent.findUnique({
      where: {
        propertyId_agentId: {
          propertyId,
          agentId,
        },
      },
    });
    if (!assignment) {
      throw new NotFoundException('Agent assignment not found for this property');
    }

    return (this.prisma as any).propertyAgent.update({
      where: {
        propertyId_agentId: {
          propertyId,
          agentId,
        },
      },
      data: {
        commissionRate: dto.commissionRate !== undefined ? new Decimal(dto.commissionRate.toString()) : undefined,
        contactPhone: dto.contactPhone !== undefined ? dto.contactPhone : undefined,
        contactEmail: dto.contactEmail !== undefined ? dto.contactEmail : undefined,
      },
      include: {
        agent: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
    });
  }

  async removeAgentAssignment(propertyId: string, agentId: string, user: AuthUserPayload) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) {
      throw new NotFoundException('Property not found');
    }

    if (user.role !== 'ADMIN' && property.ownerId !== user.sub) {
      throw new ForbiddenException('Only the property owner or an admin can remove agent assignments');
    }

    const assignment = await (this.prisma as any).propertyAgent.findUnique({
      where: {
        propertyId_agentId: {
          propertyId,
          agentId,
        },
      },
    });
    if (!assignment) {
      throw new NotFoundException('Agent assignment not found for this property');
    }

    return (this.prisma as any).propertyAgent.delete({
      where: {
        propertyId_agentId: {
          propertyId,
          agentId,
        },
      },
    });
  }

  async getAgents(propertyId: string, user: AuthUserPayload) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) {
      throw new NotFoundException('Property not found');
    }

    if (user.role !== 'ADMIN' && user.sub !== property.ownerId) {
      const assignedAgent = await (this.prisma as any).propertyAgent.findFirst({
        where: { propertyId, agentId: user.sub },
      });
      if (!assignedAgent) {
        throw new ForbiddenException('You are not authorized to view agent assignments for this property');
      }
    }

    const assignments = await (this.prisma as any).propertyAgent.findMany({
      where: { propertyId },
      include: {
        agent: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    return assignments.map((pa: any) => ({
      id: pa.id,
      propertyId: pa.propertyId,
      agentId: pa.agentId,
      commissionRate: Number(pa.commissionRate),
      contactPhone: pa.contactPhone || pa.agent.phone,
      contactEmail: pa.contactEmail || pa.agent.email,
      createdAt: pa.createdAt,
      updatedAt: pa.updatedAt,
      agent: pa.agent,
    }));
  }
}
