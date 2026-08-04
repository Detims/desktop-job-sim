import rawGeneralStudy from "../../content/core/activities/study.json" with { type: "json" };
import rawBusinessFundamentals from "../../content/core/activities/business-fundamentals.json" with { type: "json" };
import rawOfficeProcedures from "../../content/core/activities/office-procedures.json" with { type: "json" };
import {
  StudyDefinitionSchema,
  type StudyDefinition,
} from "../shared/contracts.js";

export const STUDY_DEFINITIONS = Object.freeze(
  [rawGeneralStudy, rawBusinessFundamentals, rawOfficeProcedures].map((raw) =>
    StudyDefinitionSchema.parse(raw),
  ),
);

const studies = new Map<string, StudyDefinition>(
  STUDY_DEFINITIONS.map((definition) => [definition.id, definition]),
);

export function getStudyDefinition(studyId: string): StudyDefinition {
  const definition = studies.get(studyId);
  if (definition === undefined) throw new Error("That study action is unavailable.");
  return definition;
}
