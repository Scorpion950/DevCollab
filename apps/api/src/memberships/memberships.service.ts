import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { OrganizationMemberDto, OrganizationRole } from "@devcollab/shared";
import {
  canChangeOrganizationRole,
  canRemoveOrganizationMember,
} from "../authorization/authorization.service";
import { toOrganizationMemberDto } from "../common/mappers";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class MembershipsService {
  constructor(private readonly db: DatabaseService) {}

  async listMembers(orgId: string): Promise<OrganizationMemberDto[]> {
    const members = await this.db.prisma.organizationMembership.findMany({
      where: { organizationId: orgId, status: "ACTIVE" },
      orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });
    return members.map(toOrganizationMemberDto);
  }

  async updateRole(
    actorUserId: string,
    actorRole: OrganizationRole,
    orgId: string,
    memberId: string,
    nextRoleInput: unknown,
  ): Promise<OrganizationMemberDto> {
    if (nextRoleInput !== "ADMIN" && nextRoleInput !== "MEMBER") {
      throw new BadRequestException(
        "Role must be ADMIN or MEMBER. Use ownership transfer to assign an Owner.",
      );
    }
    const nextRole: OrganizationRole = nextRoleInput;

    return this.db.prisma.$transaction(async (tx) => {
      const target = await tx.organizationMembership.findFirst({
        where: { id: memberId, organizationId: orgId, status: "ACTIVE" },
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      });
      if (!target) {
        throw new NotFoundException("Member not found in this organization.");
      }

      if (!canChangeOrganizationRole(actorRole, target.role, nextRole)) {
        throw new ForbiddenException("Your organization role does not permit changing this role.");
      }

      if (target.role === "OWNER") {
        const ownerCount = await tx.organizationMembership.count({
          where: { organizationId: orgId, role: "OWNER", status: "ACTIVE" },
        });
        if (ownerCount <= 1) {
          throw new ConflictException(
            "Cannot demote the organization's last Owner. Transfer ownership first.",
          );
        }
      }

      const updated = await tx.organizationMembership.update({
        where: { id: target.id },
        data: { role: nextRole },
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      });

      const label = target.user.name || target.user.email;
      await tx.organizationAuditLog.create({
        data: {
          organizationId: orgId,
          actorId: actorUserId,
          action: "MEMBER_ROLE_UPDATED",
          summary: `Changed ${label}'s role from ${target.role} to ${nextRole}`,
        },
      });

      return toOrganizationMemberDto(updated);
    });
  }

  async transferOwnership(
    actorUserId: string,
    orgId: string,
    targetMemberId: unknown,
  ): Promise<{ transferredTo: string }> {
    if (typeof targetMemberId !== "string" || !targetMemberId.trim()) {
      throw new BadRequestException("Target member is required.");
    }

    return this.db.prisma.$transaction(async (tx) => {
      const actorMembership = await tx.organizationMembership.findUnique({
        where: { organizationId_userId: { organizationId: orgId, userId: actorUserId } },
        include: { user: { select: { name: true, email: true } } },
      });
      const targetMembership = await tx.organizationMembership.findFirst({
        where: { id: targetMemberId, organizationId: orgId, status: "ACTIVE" },
        include: { user: { select: { name: true, email: true } } },
      });

      if (!actorMembership || actorMembership.role !== "OWNER") {
        throw new ForbiddenException("Only an organization Owner can transfer ownership.");
      }
      if (!targetMembership) {
        throw new NotFoundException("Target member not found in this organization.");
      }
      if (targetMembership.id === actorMembership.id) {
        throw new BadRequestException("You are already an Owner of this organization.");
      }

      await tx.organizationMembership.update({
        where: { id: targetMembership.id },
        data: { role: "OWNER" },
      });
      await tx.organizationMembership.update({
        where: { id: actorMembership.id },
        data: { role: "ADMIN" },
      });

      const targetLabel = targetMembership.user.name || targetMembership.user.email;
      await tx.organizationAuditLog.create({
        data: {
          organizationId: orgId,
          actorId: actorUserId,
          action: "OWNERSHIP_TRANSFERRED",
          summary: `Transferred organization ownership to ${targetLabel}`,
        },
      });

      return { transferredTo: targetMembership.userId };
    });
  }

  async removeMember(
    actorUserId: string,
    actorRole: OrganizationRole,
    orgId: string,
    memberId: string,
  ): Promise<{ removed: true }> {
    return this.db.prisma.$transaction(async (tx) => {
      const target = await tx.organizationMembership.findFirst({
        where: { id: memberId, organizationId: orgId, status: "ACTIVE" },
        include: { user: { select: { name: true, email: true } } },
      });
      if (!target) {
        throw new NotFoundException("Member not found in this organization.");
      }
      if (target.userId === actorUserId) {
        throw new BadRequestException("Use Leave Organization to remove yourself.");
      }
      if (!canRemoveOrganizationMember(actorRole, target.role)) {
        throw new ForbiddenException("Your organization role cannot remove this member.");
      }
      if (target.role === "OWNER") {
        const ownerCount = await tx.organizationMembership.count({
          where: { organizationId: orgId, role: "OWNER", status: "ACTIVE" },
        });
        if (ownerCount <= 1) {
          throw new ConflictException("Cannot remove the organization's last Owner.");
        }
      }

      await tx.projectRoleAssignment.deleteMany({
        where: { userId: target.userId, project: { organizationId: orgId } },
      });
      await tx.organizationMembership.delete({
        where: { id: target.id },
      });

      const label = target.user.name || target.user.email;
      await tx.organizationAuditLog.create({
        data: {
          organizationId: orgId,
          actorId: actorUserId,
          action: "MEMBER_REMOVED",
          summary: `Removed ${label} (${target.role}) from the organization`,
        },
      });

      return { removed: true };
    });
  }
}
