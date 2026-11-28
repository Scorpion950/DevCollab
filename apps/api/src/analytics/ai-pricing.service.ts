import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type {
  AiBudgetAuditEventDto,
  AiBudgetConfigDto,
  AiBudgetPeriod,
  AiBudgetStatusDto,
  AiModelPricingDto,
  OrganizationRole,
} from "@devcollab/shared";
import { formatMicrosToDecimal6 } from "@devcollab/ai-core";
import { DatabaseService } from "../database/database.service";
import { AnalyticsCacheService } from "./analytics-cache.service";
import { getBudgetWindowUtc } from "./date-range.util";

function parseDecimalToScale6(raw: { toString(): string } | string | number): bigint {
  const s = typeof raw === "string" ? raw.trim() : raw.toString().trim();
  if (!s) return 0n;
  const neg = s.startsWith("-");
  const clean = neg ? s.slice(1) : s;
  const [whole = "0", frac = ""] = clean.split(".");
  const w = BigInt(whole.replace(/\D/g, "") || "0");
  const f = BigInt(frac.replace(/\D/g, "").padEnd(6, "0").slice(0, 6));
  const val = w * 1_000_000n + f;
  return neg ? -val : val;
}

function validateCurrency(raw: unknown): string {
  if (raw === undefined || raw === null || raw === "") return "USD";
  if (typeof raw !== "string") {
    throw new BadRequestException("Currency must be a 3-letter ISO code (e.g. USD).");
  }
  const clean = raw.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(clean)) {
    throw new BadRequestException("Currency must be a 3-letter ISO code (e.g. USD).");
  }
  return clean;
}

function validateNonNegativeRate(
  raw: unknown,
  field: string,
  required: boolean,
): string | null {
  if (raw === undefined || raw === null || raw === "") {
    if (required) {
      throw new BadRequestException(`${field} is required.`);
    }
    return null;
  }
  const num = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(num) || num < 0 || num > 100_000) {
    throw new BadRequestException(
      `${field} must be a valid non-negative number up to 100000.`,
    );
  }
  return num.toFixed(6);
}

function validateBudgetAmount(raw: unknown): string {
  const num = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isFinite(num) || num <= 0 || num > 1_000_000) {
    throw new BadRequestException(
      "Budget amount must be greater than 0 and at most 1,000,000.",
    );
  }
  return num.toFixed(2);
}

@Injectable()
export class AiPricingService {
  constructor(
    private readonly db: DatabaseService,
    private readonly cache: AnalyticsCacheService,
  ) {}

  toPricingDto(row: {
    id: string;
    organizationId: string;
    provider: string;
    model: string;
    version: number;
    currency: string;
    inputRatePer1m: { toString(): string };
    outputRatePer1m: { toString(): string };
    cachedInputRatePer1m: { toString(): string } | null;
    reasoningRatePer1m: { toString(): string } | null;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    isActive: boolean;
    note: string | null;
    createdAt: Date;
  }): AiModelPricingDto {
    return {
      id: row.id,
      organizationId: row.organizationId,
      provider: row.provider,
      model: row.model,
      version: row.version,
      currency: row.currency,
      inputRatePer1m: Number(row.inputRatePer1m.toString()).toFixed(6),
      outputRatePer1m: Number(row.outputRatePer1m.toString()).toFixed(6),
      cachedInputRatePer1m: row.cachedInputRatePer1m
        ? Number(row.cachedInputRatePer1m.toString()).toFixed(6)
        : null,
      reasoningRatePer1m: row.reasoningRatePer1m
        ? Number(row.reasoningRatePer1m.toString()).toFixed(6)
        : null,
      effectiveFrom: row.effectiveFrom.toISOString(),
      effectiveTo: row.effectiveTo ? row.effectiveTo.toISOString() : null,
      isActive: row.isActive,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listPricing(organizationId: string): Promise<AiModelPricingDto[]> {
    const rows = await this.db.prisma.aiModelPricing.findMany({
      where: { organizationId },
      orderBy: [{ isActive: "desc" }, { provider: "asc" }, { model: "asc" }, { version: "desc" }],
    });
    return rows.map((r) => this.toPricingDto(r));
  }

  async createPricingVersion(input: {
    organizationId: string;
    actorUserId: string;
    actorOrgRole: OrganizationRole;
    body: {
      provider?: unknown;
      model?: unknown;
      currency?: unknown;
      inputRatePer1m?: unknown;
      outputRatePer1m?: unknown;
      cachedInputRatePer1m?: unknown;
      reasoningRatePer1m?: unknown;
      note?: unknown;
    };
  }): Promise<AiModelPricingDto> {
    if (input.actorOrgRole !== "OWNER" && input.actorOrgRole !== "ADMIN") {
      throw new ForbiddenException(
        "Only organization owners and admins can configure AI model pricing.",
      );
    }

    const provider =
      typeof input.body.provider === "string" ? input.body.provider.trim().toLowerCase() : "";
    if (!/^[a-z0-9][a-z0-9._-]{1,39}$/.test(provider)) {
      throw new BadRequestException(
        "Provider must be 2–40 lowercase alphanumeric characters (e.g. openai, anthropic).",
      );
    }

    const model = typeof input.body.model === "string" ? input.body.model.trim() : "";
    if (model.length < 2 || model.length > 120 || /[\r\n]/.test(model)) {
      throw new BadRequestException("Model name must be between 2 and 120 characters.");
    }

    const currency = validateCurrency(input.body.currency);
    const inputRatePer1m = validateNonNegativeRate(
      input.body.inputRatePer1m,
      "inputRatePer1m",
      true,
    )!;
    const outputRatePer1m = validateNonNegativeRate(
      input.body.outputRatePer1m,
      "outputRatePer1m",
      true,
    )!;
    const cachedInputRatePer1m = validateNonNegativeRate(
      input.body.cachedInputRatePer1m,
      "cachedInputRatePer1m",
      false,
    );
    const reasoningRatePer1m = validateNonNegativeRate(
      input.body.reasoningRatePer1m,
      "reasoningRatePer1m",
      false,
    );

    const note =
      typeof input.body.note === "string" && input.body.note.trim()
        ? input.body.note.trim().slice(0, 300)
        : null;

    const now = new Date();
    const created = await this.db.prisma.$transaction(async (tx) => {
      const latest = await tx.aiModelPricing.findFirst({
        where: { organizationId: input.organizationId, provider, model },
        orderBy: [{ version: "desc" }],
        select: { version: true },
      });

      await tx.aiModelPricing.updateMany({
        where: { organizationId: input.organizationId, provider, model, isActive: true },
        data: { isActive: false, effectiveTo: now },
      });

      const nextVersion = (latest?.version ?? 0) + 1;
      const row = await tx.aiModelPricing.create({
        data: {
          organizationId: input.organizationId,
          provider,
          model,
          version: nextVersion,
          currency,
          inputRatePer1m,
          outputRatePer1m,
          cachedInputRatePer1m,
          reasoningRatePer1m,
          effectiveFrom: now,
          isActive: true,
          createdById: input.actorUserId,
          note,
        },
      });

      await tx.organizationAuditLog.create({
        data: {
          organizationId: input.organizationId,
          actorId: input.actorUserId,
          action: "AI_PRICING_VERSION_CREATED",
          summary: `Created pricing v${nextVersion} for ${provider}/${model} (${currency} ${inputRatePer1m} in / ${outputRatePer1m} out per 1M tokens)`,
          metadata: {
            pricingId: row.id,
            provider,
            model,
            version: nextVersion,
            currency,
            inputRatePer1m,
            outputRatePer1m,
          },
        },
      });

      return row;
    });

    this.cache.invalidateOrganization(input.organizationId);
    return this.toPricingDto(created);
  }

  async evaluateBudgetStatus(
    budget: {
      id: string;
      organizationId: string;
      projectId: string | null;
      period: AiBudgetPeriod;
      currency: string;
      amountUsd: { toString(): string };
      warningThresholdPct: number;
      updatedAt: Date;
      project: { name: string; key: string } | null;
    },
    now: Date = new Date(),
  ): Promise<AiBudgetStatusDto> {
    const { windowStartDate, windowEndExclusiveDate } = getBudgetWindowUtc(
      budget.period,
      now,
    );
    const scopeWhere = {
      organizationId: budget.organizationId,
      ...(budget.projectId ? { projectId: budget.projectId } : {}),
      createdAt: { gte: windowStartDate, lt: windowEndExclusiveDate },
    };

    const [agentRows, assistantRows] = await Promise.all([
      this.db.prisma.agentUsageRecord.findMany({
        where: scopeWhere,
        select: {
          usageAvailable: true,
          costAvailable: true,
          currency: true,
          estimatedCostUsd: true,
        },
      }),
      this.db.prisma.aiAssistantUsageRecord.findMany({
        where: scopeWhere,
        select: {
          usageAvailable: true,
          costAvailable: true,
          currency: true,
          estimatedCostUsd: true,
        },
      }),
    ]);

    const allRows = [...agentRows, ...assistantRows];
    let totalMicros = 0n;
    let costedCallCount = 0;
    let uncostedCallCount = 0;
    let unreportedUsageCallCount = 0;
    let mismatchedCurrencyCount = 0;

    for (const r of allRows) {
      if (!r.usageAvailable) unreportedUsageCallCount += 1;
      if (r.costAvailable && r.estimatedCostUsd !== null) {
        if ((r.currency || "USD") === budget.currency) {
          totalMicros += parseDecimalToScale6(r.estimatedCostUsd);
          costedCallCount += 1;
        } else {
          mismatchedCurrencyCount += 1;
          uncostedCallCount += 1;
        }
      } else {
        uncostedCallCount += 1;
      }
    }

    const budgetDto: AiBudgetConfigDto = {
      id: budget.id,
      organizationId: budget.organizationId,
      projectId: budget.projectId,
      projectName: budget.project?.name ?? null,
      projectKey: budget.project?.key ?? null,
      period: budget.period,
      currency: budget.currency,
      amountUsd: Number(budget.amountUsd.toString()).toFixed(2),
      warningThresholdPct: budget.warningThresholdPct,
      hardEnforcementSupported: false,
      updatedAt: budget.updatedAt.toISOString(),
    };

    const amountMicros = parseDecimalToScale6(budgetDto.amountUsd);
    const warnings: string[] = [];

    if (costedCallCount === 0 && uncostedCallCount > 0) {
      warnings.push(
        `Pricing or token telemetry is unavailable for ${uncostedCallCount} AI request(s) in this window.`,
      );
      return {
        budget: budgetDto,
        windowStartUtc: windowStartDate.toISOString(),
        windowEndUtc: new Date(windowEndExclusiveDate.getTime() - 1).toISOString(),
        consumedAmount: null,
        consumedPct: null,
        costedCallCount,
        uncostedCallCount,
        unreportedUsageCallCount,
        state: "PRICING_UNAVAILABLE",
        warnings,
      };
    }

    const consumedAmount = formatMicrosToDecimal6(totalMicros);
    const consumedPct =
      amountMicros > 0n
        ? Math.round((Number(totalMicros) / Number(amountMicros)) * 1000) / 10
        : 0;

    if (uncostedCallCount > 0) {
      warnings.push(
        `${uncostedCallCount} AI request(s) in this window lack matching ${budget.currency} pricing snapshots; spend is a partial estimate.`,
      );
    }
    if (mismatchedCurrencyCount > 0) {
      warnings.push(
        `${mismatchedCurrencyCount} request(s) were priced in another currency and excluded from ${budget.currency} budget progress.`,
      );
    }

    let state: AiBudgetStatusDto["state"] = "OK";
    if (totalMicros >= amountMicros) {
      state = "BUDGET_EXCEEDED";
      warnings.unshift(
        `Estimated spend (${budget.currency} ${consumedAmount}) has reached or exceeded the ${budget.period.toLowerCase()} advisory threshold (${budget.currency} ${budgetDto.amountUsd}). AI execution is not automatically blocked.`,
      );
    } else if (consumedPct >= budget.warningThresholdPct) {
      state = "APPROACHING_BUDGET";
      warnings.unshift(
        `Estimated spend reached ${consumedPct}% of the ${budget.period.toLowerCase()} threshold (warning set at ${budget.warningThresholdPct}%). Advisory only — AI execution is not blocked.`,
      );
    } else if (uncostedCallCount > 0 || unreportedUsageCallCount > 0) {
      state = "INCOMPLETE_DATA";
    }

    return {
      budget: budgetDto,
      windowStartUtc: windowStartDate.toISOString(),
      windowEndUtc: new Date(windowEndExclusiveDate.getTime() - 1).toISOString(),
      consumedAmount,
      consumedPct,
      costedCallCount,
      uncostedCallCount,
      unreportedUsageCallCount,
      state,
      warnings,
    };
  }

  async listBudgetsWithStatus(organizationId: string): Promise<{
    budgets: AiBudgetStatusDto[];
    auditEvents: AiBudgetAuditEventDto[];
  }> {
    const [budgetRows, auditRows] = await Promise.all([
      this.db.prisma.aiBudgetConfig.findMany({
        where: { organizationId },
        orderBy: [{ projectId: "asc" }, { updatedAt: "desc" }],
        include: { project: { select: { name: true, key: true } } },
      }),
      this.db.prisma.aiBudgetAuditEvent.findMany({
        where: { organizationId },
        orderBy: [{ createdAt: "desc" }],
        take: 25,
        include: {
          actor: { select: { id: true, name: true, email: true, image: true } },
        },
      }),
    ]);

    const now = new Date();
    const budgets = await Promise.all(
      budgetRows.map((b) => this.evaluateBudgetStatus(b, now)),
    );

    const auditEvents: AiBudgetAuditEventDto[] = auditRows.map((a) => ({
      id: a.id,
      projectId: a.projectId,
      action: a.action,
      actor: a.actor,
      previousValue: a.previousValue,
      newValue: a.newValue,
      createdAt: a.createdAt.toISOString(),
    }));

    return { budgets, auditEvents };
  }

  async getProjectBudgetStatus(
    organizationId: string,
    projectId: string,
  ): Promise<AiBudgetStatusDto | null> {
    const row = await this.db.prisma.aiBudgetConfig.findFirst({
      where: { organizationId, projectId },
      include: { project: { select: { name: true, key: true } } },
    });
    if (!row) return null;
    return this.evaluateBudgetStatus(row);
  }

  async upsertBudget(input: {
    organizationId: string;
    projectId?: string | null;
    actorUserId: string;
    body: {
      period?: unknown;
      currency?: unknown;
      amountUsd?: unknown;
      warningThresholdPct?: unknown;
    };
  }): Promise<AiBudgetStatusDto> {
    const periodRaw =
      typeof input.body.period === "string"
        ? input.body.period.trim().toUpperCase()
        : "MONTHLY";
    if (periodRaw !== "WEEKLY" && periodRaw !== "MONTHLY") {
      throw new BadRequestException('Budget period must be "WEEKLY" or "MONTHLY".');
    }
    const period: AiBudgetPeriod = periodRaw;
    const currency = validateCurrency(input.body.currency);
    const amountUsd = validateBudgetAmount(input.body.amountUsd);

    let warningThresholdPct = 80;
    if (
      input.body.warningThresholdPct !== undefined &&
      input.body.warningThresholdPct !== null &&
      input.body.warningThresholdPct !== ""
    ) {
      const pct = Number(input.body.warningThresholdPct);
      if (!Number.isInteger(pct) || pct < 1 || pct > 100) {
        throw new BadRequestException(
          "warningThresholdPct must be a whole number between 1 and 100.",
        );
      }
      warningThresholdPct = pct;
    }

    const projectId = input.projectId ?? null;
    const scopeKey = projectId
      ? `project:${projectId}`
      : `org:${input.organizationId}`;

    const saved = await this.db.prisma.$transaction(async (tx) => {
      const existing = await tx.aiBudgetConfig.findUnique({
        where: { scopeKey },
        select: {
          id: true,
          period: true,
          currency: true,
          amountUsd: true,
          warningThresholdPct: true,
        },
      });

      const previousValue = existing
        ? {
            period: existing.period,
            currency: existing.currency,
            amountUsd: existing.amountUsd.toString(),
            warningThresholdPct: existing.warningThresholdPct,
          }
        : null;

      const newValue = {
        period,
        currency,
        amountUsd,
        warningThresholdPct,
        hardEnforcementSupported: false,
      };

      const row = existing
        ? await tx.aiBudgetConfig.update({
            where: { scopeKey },
            data: {
              period,
              currency,
              amountUsd,
              warningThresholdPct,
              hardLimitMode: false,
              updatedById: input.actorUserId,
            },
            include: { project: { select: { name: true, key: true } } },
          })
        : await tx.aiBudgetConfig.create({
            data: {
              organizationId: input.organizationId,
              projectId,
              scopeKey,
              period,
              currency,
              amountUsd,
              warningThresholdPct,
              hardLimitMode: false,
              updatedById: input.actorUserId,
            },
            include: { project: { select: { name: true, key: true } } },
          });

      const action = existing ? "BUDGET_UPDATED" : "BUDGET_CREATED";
      await tx.aiBudgetAuditEvent.create({
        data: {
          organizationId: input.organizationId,
          projectId,
          budgetId: row.id,
          actorId: input.actorUserId,
          action,
          previousValue: previousValue ?? undefined,
          newValue,
        },
      });

      await tx.organizationAuditLog.create({
        data: {
          organizationId: input.organizationId,
          projectId,
          actorId: input.actorUserId,
          action: "AI_BUDGET_CONFIG_UPDATED",
          summary: `${existing ? "Updated" : "Created"} ${projectId ? "project" : "organization"} ${period.toLowerCase()} AI advisory budget (${currency} ${amountUsd}, warn at ${warningThresholdPct}%)`,
          metadata: newValue,
        },
      });

      return row;
    });

    if (projectId) {
      this.cache.invalidateProject(input.organizationId, projectId);
    } else {
      this.cache.invalidateOrganization(input.organizationId);
    }

    return this.evaluateBudgetStatus(saved);
  }
}
