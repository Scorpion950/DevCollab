/**
 * Exact decimal-scaled AI token cost calculator.
 * Avoids floating-point drift by scaling per-1M token prices to 1e-6 (micro-units)
 * and dividing token-weighted products cleanly to 6 fractional digits.
 */

export interface ModelPricingRuleInput {
  id: string | null;
  currency: string;
  inputRatePer1m: { toString(): string } | string | number;
  outputRatePer1m: { toString(): string } | string | number;
  cachedInputRatePer1m?: { toString(): string } | string | number | null;
}

export interface CalculatedUsageCost {
  pricingId: string | null;
  currency: string;
  costAvailable: boolean;
  estimatedCostUsd: string | null;
}

function parseDecimalToScale6(raw: { toString(): string } | string | number): bigint {
  const s = typeof raw === "string" ? raw.trim() : raw.toString().trim();
  if (!s) return 0n;
  const neg = s.startsWith("-");
  const clean = neg ? s.slice(1) : s;
  const [wholePart = "0", fracPart = ""] = clean.split(".");
  const wholeDigits = wholePart.replace(/\D/g, "") || "0";
  const fracDigits = fracPart.replace(/\D/g, "").padEnd(6, "0").slice(0, 6);
  const val = BigInt(wholeDigits) * 1_000_000n + BigInt(fracDigits);
  return neg ? -val : val;
}

export function formatMicrosToDecimal6(micros: bigint): string {
  const neg = micros < 0n;
  const abs = neg ? -micros : micros;
  const whole = abs / 1_000_000n;
  const frac = (abs % 1_000_000n).toString().padStart(6, "0");
  return `${neg ? "-" : ""}${whole.toString()}.${frac}`;
}

export function computeUsageCostFromPricing(input: {
  usageReported: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens?: number | null;
  pricingRule?: ModelPricingRuleInput | null;
  fallbackCostAvailable?: boolean;
  fallbackEstimatedCostUsd?: string | null;
}): CalculatedUsageCost {
  const rule = input.pricingRule ?? null;

  if (!input.usageReported || input.inputTokens === null || input.outputTokens === null) {
    return {
      pricingId: rule?.id ?? null,
      currency: rule?.currency ?? "USD",
      costAvailable: false,
      estimatedCostUsd: null,
    };
  }

  if (rule) {
    const inTokens = BigInt(Math.max(0, Math.round(input.inputTokens)));
    const outTokens = BigInt(Math.max(0, Math.round(input.outputTokens)));
    const cachedRaw =
      input.cachedTokens !== null && input.cachedTokens !== undefined
        ? Math.max(0, Math.round(input.cachedTokens))
        : 0;
    const cachedApplied =
      rule.cachedInputRatePer1m !== null && rule.cachedInputRatePer1m !== undefined
        ? BigInt(Math.min(Number(inTokens), cachedRaw))
        : 0n;
    const standardInTokens = inTokens - cachedApplied;

    const inRateMicros = parseDecimalToScale6(rule.inputRatePer1m);
    const outRateMicros = parseDecimalToScale6(rule.outputRatePer1m);
    const cachedRateMicros =
      rule.cachedInputRatePer1m !== null && rule.cachedInputRatePer1m !== undefined
        ? parseDecimalToScale6(rule.cachedInputRatePer1m)
        : 0n;

    // Rate is per 1,000,000 tokens in micro-currency -> total pico-currency, then half-up divide by 1,000,000
    const numeratorPico =
      standardInTokens * inRateMicros +
      cachedApplied * cachedRateMicros +
      outTokens * outRateMicros;
    const roundedMicros = (numeratorPico + 500_000n) / 1_000_000n;

    return {
      pricingId: rule.id,
      currency: rule.currency || "USD",
      costAvailable: true,
      estimatedCostUsd: formatMicrosToDecimal6(roundedMicros),
    };
  }

  if (input.fallbackCostAvailable && input.fallbackEstimatedCostUsd !== null && input.fallbackEstimatedCostUsd !== undefined) {
    return {
      pricingId: null,
      currency: "USD",
      costAvailable: true,
      estimatedCostUsd: formatMicrosToDecimal6(parseDecimalToScale6(input.fallbackEstimatedCostUsd)),
    };
  }

  return {
    pricingId: null,
    currency: "USD",
    costAvailable: false,
    estimatedCostUsd: null,
  };
}
