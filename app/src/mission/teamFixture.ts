/**
 * FICTIONAL personal data shown on the team cards (visual fixture). Read-only for the user, never
 * sent to the engine and with no effect on the calculation. Keyed by catalog `profile_id`.
 * Human values come from the mission-wizard spec ("Propuesto"); robot values are placeholders for
 * the team to define.
 */
export interface HumanFixture { kind: "human"; age_years: number; height_m: number; mass_kg: number }
export interface RobotFixture { kind: "robot"; mass_kg: number; length_m: number; width_m: number; drive: "wheels4" | "wheels6" }
export type MemberFixture = HumanFixture | RobotFixture;

export const TEAM_FIXTURE: Record<string, MemberFixture> = {
  explorer_01: { kind: "human", age_years: 38, height_m: 1.75, mass_kg: 70 },
  explorer_02: { kind: "human", age_years: 44, height_m: 1.68, mass_kg: 62 },
  explorer_03: { kind: "human", age_years: 41, height_m: 1.82, mass_kg: 85 },
  explorer_04: { kind: "human", age_years: 35, height_m: 1.79, mass_kg: 78 },
  support_rover: { kind: "robot", mass_kg: 180, length_m: 1.6, width_m: 1.1, drive: "wheels4" },
  transport_rover: { kind: "robot", mass_kg: 420, length_m: 2.4, width_m: 1.6, drive: "wheels6" },
};

export const KG_TO_LB = 2.20462;
