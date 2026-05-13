export const PERSONA_TYPES = ['diplomat', 'storyteller', 'debater', 'empath'] as const;
export type PersonaType = (typeof PERSONA_TYPES)[number];

/** Composite level required to unlock (inclusive). */
export const PERSONA_UNLOCK_LEVEL: Record<PersonaType, number> = {
  diplomat: 1,
  storyteller: 3,
  debater: 5,
  empath: 1, // unlocked via passport stamps (4 stamps) — enforced in service
};

export const EMPATH_UNLOCK_STAMPS = 4;
