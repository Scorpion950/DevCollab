import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import type {
  CreatedInvitationDto,
  InvitationInspectDto,
  InvitationStatus,
  OrganizationInvitationDto,
  OrganizationRole,
} from "@devcollab/shared";
import { canInviteOrganizationRole } from "../authorization/authorization.service";
import { isPrismaUniqueError, maskEmail, requireEmail } from "../common/validation";
import { DatabaseService } from "../database/database.service";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function toInvitationDto(inv: {
  id: string;
  organizationId: string;
  email: string;
  role: OrganizationRole;
  status: InvitationStatus;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  invitedBy: { id: string; name: string | null; email: string } | null;
}): OrganizationInvitationDto {
  const effectiveStatus: InvitationStatus =
    inv.status === "PENDING" && inv.expiresAt <= new Date() ? "EXPIRED" : inv.status;
  return {
    id: inv.id,
    organizationId: inv.organizationId,
    email: inv.email,
    role: inv.role,
    status: effectiveStatus,
    expiresAt: inv.expiresAt.toISOString(),
    acceptedAt: inv.acceptedAt ? inv.acceptedAt.toISOString() : null,
    revokedAt: inv.revokedAt ? inv.revokedAt.toISOString() : null,
    createdAt: inv.createdAt.toISOString(),
    invitedBy: inv.invitedBy,
  };
}

@Injectable()
export class InvitationsService {
  constructor(private readonly db: DatabaseService) {}

  async listForOrg(orgId: string): Promise<OrganizationInvitationDto[]> {
    const rows = await this.db.prisma.organizationInvitation.findMany({
      where: { organizationId: orgId },
      orderBy: [{ createdAt: "desc" }],
      take: 50,
      include: {
        invitedBy: { select: { id: true, name: true, email: true } },
      },
    });
    return rows.map(toInvitationDto);
  }

  async createInvitation(
    actorUserId: string,
    actorRole: OrganizationRole,
    orgId: string,
    body: { email?: unknown; role?: unknown },
  ): Promise<CreatedInvitationDto> {
    const email = requireEmail(body?.email);
    const requestedRole: OrganizationRole =
      body?.role === "ADMIN" || body?.role === "MEMBER" ? body.role : "MEMBER";

    if (!canInviteOrganizationRole(actorRole, requestedRole)) {
      throw new ForbiddenException("Your organization role cannot invite a member with this role.");
    }

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);

    try {
      const invitation = await this.db.prisma.$transaction(async (tx) => {
        const existingUser = await tx.user.findUnique({
          where: { email },
          select: { id: true },
        });
        if (existingUser) {
          const existingMember = await tx.organizationMembership.findUnique({
            where: {
              organizationId_userId: { organizationId: orgId, userId: existingUser.id },
            },
            select: { id: true },
          });
          if (existingMember) {
            throw new ConflictException("This user is already a member of the organization.");
          }
        }

        // Release any expired pending lock before checking for an active pending invitation.
        await tx.organizationInvitation.updateMany({
          where: {
            organizationId: orgId,
            email,
            status: "PENDING",
            expiresAt: { lte: now },
          },
          data: { status: "EXPIRED", activeLock: null },
        });

        const existingPending = await tx.organizationInvitation.findFirst({
          where: {
            organizationId: orgId,
            email,
            status: "PENDING",
            expiresAt: { gt: now },
          },
          select: { id: true },
        });
        if (existingPending) {
          throw new ConflictException("A pending invitation already exists for this email address.");
        }

        const created = await tx.organizationInvitation.create({
          data: {
            organizationId: orgId,
            email,
            role: requestedRole,
            tokenHash,
            status: "PENDING",
            activeLock: "ACTIVE",
            invitedById: actorUserId,
            expiresAt,
          },
          include: {
            invitedBy: { select: { id: true, name: true, email: true } },
          },
        });

        await tx.organizationAuditLog.create({
          data: {
            organizationId: orgId,
            actorId: actorUserId,
            action: "INVITATION_CREATED",
            summary: `Created ${requestedRole.toLowerCase()} invitation for ${email}`,
          },
        });

        return created;
      });

      return {
        invitation: toInvitationDto(invitation),
        token: rawToken,
      };
    } catch (error) {
      if (isPrismaUniqueError(error)) {
        throw new ConflictException("A pending invitation already exists for this email address.");
      }
      throw error;
    }
  }

  async revokeInvitation(
    actorUserId: string,
    orgId: string,
    invitationId: string,
  ): Promise<OrganizationInvitationDto> {
    return this.db.prisma.$transaction(async (tx) => {
      const existing = await tx.organizationInvitation.findFirst({
        where: { id: invitationId, organizationId: orgId },
        include: { invitedBy: { select: { id: true, name: true, email: true } } },
      });
      if (!existing) {
        throw new NotFoundException("Invitation not found in this organization.");
      }
      if (existing.status !== "PENDING") {
        throw new ConflictException("Only pending invitations can be revoked.");
      }

      const updated = await tx.organizationInvitation.update({
        where: { id: existing.id },
        data: { status: "REVOKED", activeLock: null, revokedAt: new Date() },
        include: { invitedBy: { select: { id: true, name: true, email: true } } },
      });

      await tx.organizationAuditLog.create({
        data: {
          organizationId: orgId,
          actorId: actorUserId,
          action: "INVITATION_REVOKED",
          summary: `Revoked invitation for ${existing.email}`,
        },
      });

      return toInvitationDto(updated);
    });
  }

  async inspectPublic(tokenInput: unknown): Promise<InvitationInspectDto> {
    const token = typeof tokenInput === "string" ? tokenInput.trim() : "";
    if (!token || token.length < 16 || token.length > 256) {
      return { state: "INVALID" };
    }
    const invitation = await this.db.prisma.organizationInvitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
        invitedBy: { select: { name: true } },
      },
    });
    if (!invitation) return { state: "INVALID" };
    if (invitation.status === "REVOKED") {
      return { state: "REVOKED", organizationName: invitation.organization.name };
    }
    if (invitation.status === "ACCEPTED") {
      return { state: "ACCEPTED", organizationName: invitation.organization.name };
    }
    if (invitation.status === "EXPIRED" || invitation.expiresAt <= new Date()) {
      return { state: "EXPIRED", organizationName: invitation.organization.name };
    }
    return {
      state: "ELIGIBLE",
      organizationId: invitation.organization.id,
      organizationName: invitation.organization.name,
      organizationSlug: invitation.organization.slug,
      role: invitation.role,
      expiresAt: invitation.expiresAt.toISOString(),
      invitedEmailMasked: maskEmail(invitation.email),
      invitedByName: invitation.invitedBy?.name ?? null,
    };
  }

  async inspectForUser(userId: string, tokenInput: unknown): Promise<InvitationInspectDto> {
    const token = typeof tokenInput === "string" ? tokenInput.trim() : "";
    if (!token || token.length < 16 || token.length > 256) {
      return { state: "INVALID" };
    }

    const [user, invitation] = await Promise.all([
      this.db.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } }),
      this.db.prisma.organizationInvitation.findUnique({
        where: { tokenHash: hashToken(token) },
        include: {
          organization: { select: { id: true, name: true, slug: true } },
          invitedBy: { select: { name: true } },
        },
      }),
    ]);

    if (!invitation) return { state: "INVALID" };
    if (invitation.status === "REVOKED") {
      return { state: "REVOKED", organizationName: invitation.organization.name };
    }
    if (invitation.status === "ACCEPTED") {
      return { state: "ACCEPTED", organizationName: invitation.organization.name };
    }
    if (invitation.status === "EXPIRED" || invitation.expiresAt <= new Date()) {
      return { state: "EXPIRED", organizationName: invitation.organization.name };
    }
    if (!user || user.email.trim().toLowerCase() !== invitation.email.trim().toLowerCase()) {
      return {
        state: "EMAIL_MISMATCH",
        organizationName: invitation.organization.name,
        invitedEmailMasked: maskEmail(invitation.email),
      };
    }

    const existingMember = await this.db.prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: { organizationId: invitation.organizationId, userId },
      },
      select: { id: true },
    });
    if (existingMember) {
      return {
        state: "ALREADY_MEMBER",
        organizationId: invitation.organization.id,
        organizationName: invitation.organization.name,
        organizationSlug: invitation.organization.slug,
      };
    }

    return {
      state: "ELIGIBLE",
      organizationId: invitation.organization.id,
      organizationName: invitation.organization.name,
      organizationSlug: invitation.organization.slug,
      role: invitation.role,
      expiresAt: invitation.expiresAt.toISOString(),
      invitedEmailMasked: maskEmail(invitation.email),
      invitedByName: invitation.invitedBy?.name ?? null,
    };
  }

  async acceptInvitation(
    userId: string,
    tokenInput: unknown,
  ): Promise<{ organizationId: string; organizationName: string; organizationSlug: string; role: OrganizationRole }> {
    const token = typeof tokenInput === "string" ? tokenInput.trim() : "";
    if (!token || token.length < 16 || token.length > 256) {
      throw new NotFoundException("Invalid invitation token.");
    }

    const tokenHash = hashToken(token);
    const now = new Date();

    return this.db.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true },
      });
      const invitation = await tx.organizationInvitation.findUnique({
        where: { tokenHash },
        include: { organization: { select: { id: true, name: true, slug: true } } },
      });

      if (!invitation) {
        throw new NotFoundException("Invitation not found or invalid.");
      }
      if (invitation.status === "REVOKED") {
        throw new ConflictException("This invitation has been revoked.");
      }
      if (invitation.status === "ACCEPTED") {
        throw new ConflictException("This invitation has already been accepted.");
      }
      if (invitation.status === "EXPIRED" || invitation.expiresAt <= now) {
        if (invitation.status === "PENDING") {
          await tx.organizationInvitation.updateMany({
            where: { id: invitation.id, status: "PENDING" },
            data: { status: "EXPIRED", activeLock: null },
          });
        }
        throw new ConflictException("This invitation has expired.");
      }
      if (!user || user.email.trim().toLowerCase() !== invitation.email.trim().toLowerCase()) {
        throw new ForbiddenException(
          "This invitation is addressed to a different email account.",
        );
      }

      const existingMember = await tx.organizationMembership.findUnique({
        where: {
          organizationId_userId: { organizationId: invitation.organizationId, userId },
        },
        select: { id: true },
      });
      if (existingMember) {
        throw new ConflictException("You are already a member of this organization.");
      }

      const claimed = await tx.organizationInvitation.updateMany({
        where: { id: invitation.id, status: "PENDING", expiresAt: { gt: now } },
        data: {
          status: "ACCEPTED",
          activeLock: null,
          acceptedAt: now,
          acceptedById: userId,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException("This invitation is no longer available.");
      }

      await tx.organizationMembership.create({
        data: {
          organizationId: invitation.organizationId,
          userId,
          role: invitation.role,
          status: "ACTIVE",
        },
      });

      const label = user.name || user.email;
      await tx.organizationAuditLog.create({
        data: {
          organizationId: invitation.organizationId,
          actorId: userId,
          action: "INVITATION_ACCEPTED",
          summary: `${label} accepted an invitation as ${invitation.role}`,
        },
      });

      return {
        organizationId: invitation.organization.id,
        organizationName: invitation.organization.name,
        organizationSlug: invitation.organization.slug,
        role: invitation.role,
      };
    });
  }
}
