export const enMessages = {
  reference: {
    blocked: {
      selfChild: 'Cannot reference a node as its own child',
      cycle: 'Cannot create this tree reference (would create a cycle)',
      unavailable: 'This reference cannot be created',
      createFallback: 'This tree reference cannot be created (it may create a cycle)',
    },
    selector: {
      blockedBadge: 'Blocked',
      disabledReasonSelfChild: 'Cannot reference a node as its own child',
      disabledReasonCycle: 'Would create a circular tree reference',
      disabledReasonUnavailable: 'This node cannot be referenced right now',
    },
  },
} as const;

export type EnMessages = typeof enMessages;
