import rawClerk from "../../content/core/careers/clerk.json" with {
  type: "json",
};
import rawAdministrativeAssistant from "../../content/core/careers/administrative-assistant.json" with {
  type: "json",
};
import rawAuditRecords from "../../content/core/jobs/audit-records.json" with {
  type: "json",
};
import rawOrganizeMail from "../../content/core/jobs/organize-mail.json" with {
  type: "json",
};
import rawProcessForms from "../../content/core/jobs/process-forms.json" with {
  type: "json",
};
import rawScheduleCoordination from "../../content/core/jobs/schedule-coordination.json" with {
  type: "json",
};
import {
  CareerDefinitionSchema,
  CareerJobDefinitionSchema,
  type CareerDefinition,
  type CareerJobDefinition,
  type CareerProgress,
  type PetState,
} from "../shared/contracts.js";
import type { MeaningfulEventDraft } from "../shared/settings-activity-types.js";

export const CLERK_CAREER = CareerDefinitionSchema.parse(rawClerk);
export const ADMINISTRATIVE_ASSISTANT_CAREER =
  CareerDefinitionSchema.parse(rawAdministrativeAssistant);
export const CLERK_JOBS = Object.freeze(
  [rawOrganizeMail, rawProcessForms, rawAuditRecords].map((definition) =>
    CareerJobDefinitionSchema.parse(definition),
  ),
);
export const ADMINISTRATIVE_ASSISTANT_JOBS = Object.freeze([
  CareerJobDefinitionSchema.parse(rawScheduleCoordination),
]);

const careers = new Map<string, CareerDefinition>([
  [CLERK_CAREER.id, CLERK_CAREER],
  [ADMINISTRATIVE_ASSISTANT_CAREER.id, ADMINISTRATIVE_ASSISTANT_CAREER],
]);
const jobs = new Map<string, CareerJobDefinition>(
  [...CLERK_JOBS, ...ADMINISTRATIVE_ASSISTANT_JOBS].map((job) => [job.id, job]),
);

function validateContent(): void {
  const rankIds = new Set(CLERK_CAREER.ranks.map((rank) => rank.id));
  if (rankIds.size !== CLERK_CAREER.ranks.length) {
    throw new Error("Clerk career rank identifiers must be unique.");
  }
  if (CLERK_CAREER.ranks[0]?.advancement !== "enrollment") {
    throw new Error("The first Clerk rank must be granted at enrollment.");
  }
  for (const job of CLERK_JOBS) {
    if (job.careerId !== CLERK_CAREER.id || !rankIds.has(job.requiredRankId)) {
      throw new Error(`Career job ${job.id} references invalid Clerk content.`);
    }
  }
  for (const career of careers.values()) {
    const rankIds = new Set(career.ranks.map((rank) => rank.id));
    if (rankIds.size !== career.ranks.length || career.ranks[0]?.advancement !== "enrollment") {
      throw new Error(`${career.name} has invalid rank content.`);
    }
    for (const job of jobs.values()) {
      if (job.careerId === career.id && !rankIds.has(job.requiredRankId)) {
        throw new Error(`Career job ${job.id} references an invalid rank.`);
      }
    }
  }
}
validateContent();

export class CareerRuleError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CareerRuleError";
  }
}

export function getCareerDefinition(careerId: string): CareerDefinition {
  const definition = careers.get(careerId);
  if (definition === undefined) {
    throw new CareerRuleError("career.unknown", "That career is unavailable.");
  }
  return definition;
}

export function getCareerJobDefinition(jobId: string): CareerJobDefinition {
  const definition = jobs.get(jobId);
  if (definition === undefined) {
    throw new CareerRuleError("career.job_unknown", "That career job is unavailable.");
  }
  return definition;
}

export function rankIndex(
  career: CareerDefinition,
  rankId: string,
): number {
  return career.ranks.findIndex((rank) => rank.id === rankId);
}

export function canEnrollCareer(
  state: PetState,
  career: CareerDefinition,
): boolean {
  return (
    state.careers[career.id] === undefined &&
    (career.enrollmentQualificationId === undefined ||
      state.qualifications[career.enrollmentQualificationId] !== undefined) &&
    (state.knowledge[career.enrollmentKnowledge.fieldId] ?? 0) >=
      career.enrollmentKnowledge.minimum
  );
}

export function enrollCareer(
  state: PetState,
  careerId: string,
  now: number,
): PetState {
  const career = getCareerDefinition(careerId);
  if (state.careers[careerId] !== undefined) return state;
  if (!canEnrollCareer(state, career)) {
    if (
      career.enrollmentQualificationId !== undefined &&
      state.qualifications[career.enrollmentQualificationId] === undefined
    ) {
      throw new CareerRuleError(
        "career.qualification_required",
        "Pass the required qualification exam first.",
      );
    }
    throw new CareerRuleError(
      "career.enrollment_requirements",
      `Requires ${career.enrollmentKnowledge.minimum} General Knowledge.`,
    );
  }
  const firstRank = career.ranks[0];
  if (firstRank === undefined) {
    throw new CareerRuleError("career.definition_invalid", "That career has no ranks.");
  }
  return {
    ...state,
    careers: {
      ...state.careers,
      [careerId]: {
        careerId,
        enrolledAt: now,
        mastery: 0,
        promotionReadyAt: null,
        rankId: firstRank.id,
      },
    },
    statusText: `Started the ${career.name} career as ${firstRank.name}.`,
  };
}

function requirementsMet(
  state: PetState,
  progress: CareerProgress,
  career: CareerDefinition,
  rankIndexToCheck: number,
): boolean {
  const rank = career.ranks[rankIndexToCheck];
  return (
    rank !== undefined &&
    progress.mastery >= rank.requiredMastery &&
    (state.knowledge[career.enrollmentKnowledge.fieldId] ?? 0) >=
      rank.requiredKnowledge
  );
}

export function reconcileCareerProgression(
  state: PetState,
  now: number,
): PetState {
  let careersChanged = false;
  const nextCareers = { ...state.careers };

  for (const [careerId, existing] of Object.entries(state.careers)) {
    const career = careers.get(careerId);
    if (career === undefined) continue;
    let progress = existing;
    let currentIndex = rankIndex(career, progress.rankId);
    const nextRank = career.ranks[currentIndex + 1];

    if (
      nextRank?.advancement === "automatic" &&
      requirementsMet(state, progress, career, currentIndex + 1)
    ) {
      progress = { ...progress, rankId: nextRank.id };
      currentIndex += 1;
      careersChanged = true;
    }

    const promotionRank = career.ranks[currentIndex + 1];
    if (
      promotionRank?.advancement === "promotion" &&
      progress.promotionReadyAt === null &&
      requirementsMet(state, progress, career, currentIndex + 1)
    ) {
      progress = { ...progress, promotionReadyAt: now };
      careersChanged = true;
    }

    nextCareers[careerId] = progress;
  }

  return careersChanged ? { ...state, careers: nextCareers } : state;
}

export function promoteCareer(
  state: PetState,
  careerId: string,
): PetState {
  const career = getCareerDefinition(careerId);
  const progress = state.careers[careerId];
  if (progress === undefined) {
    throw new CareerRuleError("career.not_enrolled", "Start this career first.");
  }
  const nextRank = career.ranks[rankIndex(career, progress.rankId) + 1];
  if (
    nextRank?.advancement !== "promotion" ||
    progress.promotionReadyAt === null
  ) {
    throw new CareerRuleError(
      "career.promotion_unavailable",
      "Promotion requirements are not yet met.",
    );
  }
  return {
    ...state,
    careers: {
      ...state.careers,
      [careerId]: {
        ...progress,
        promotionReadyAt: null,
        rankId: nextRank.id,
      },
    },
    statusText: `Promoted to ${nextRank.name}.`,
  };
}

export function isCareerJobUnlocked(
  state: PetState,
  job: CareerJobDefinition,
): boolean {
  const career = getCareerDefinition(job.careerId);
  const progress = state.careers[job.careerId];
  return (
    progress !== undefined &&
    rankIndex(career, progress.rankId) >= rankIndex(career, job.requiredRankId)
  );
}

export function careerEventDrafts(
  before: PetState,
  after: PetState,
): MeaningfulEventDraft[] {
  const events: MeaningfulEventDraft[] = [];
  for (const [careerId, next] of Object.entries(after.careers)) {
    const career = careers.get(careerId);
    if (career === undefined) continue;
    const previous = before.careers[careerId];
    if (previous === undefined) {
      const rank = career.ranks[rankIndex(career, next.rankId)];
      events.push({
        details: { careerId, rankId: next.rankId },
        petId: after.petId,
        summary: `Started the ${career.name} career as ${rank?.name ?? next.rankId}.`,
        type: "career.enrolled",
      });
      continue;
    }
    if (previous.rankId !== next.rankId) {
      const rank = career.ranks[rankIndex(career, next.rankId)];
      events.push({
        details: {
          careerId,
          fromRankId: previous.rankId,
          toRankId: next.rankId,
        },
        petId: after.petId,
        summary: `${career.name} rank advanced to ${rank?.name ?? next.rankId}.`,
        type:
          rank?.advancement === "promotion"
            ? "career.promoted"
            : "career.advanced",
      });
    }
    if (
      previous.promotionReadyAt === null &&
      next.promotionReadyAt !== null
    ) {
      const currentIndex = rankIndex(career, next.rankId);
      const target = career.ranks[currentIndex + 1];
      events.push({
        details: { careerId, targetRankId: target?.id ?? "unknown" },
        petId: after.petId,
        summary: `${career.name} promotion to ${target?.name ?? "the next rank"} is ready.`,
        type: "career.promotion_ready",
      });
    }
  }
  return events;
}
