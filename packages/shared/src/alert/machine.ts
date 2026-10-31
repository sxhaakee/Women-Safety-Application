/**
 * Alert State Machine
 *
 * Implements the full alert lifecycle as an immutable reducer.
 * All illegal transitions throw AlertTransitionError and are unit-tested.
 * Terminal states: resolved, cancelled, false_alarm
 */

export type AlertStatus =
  | 'idle'
  | 'countdown'
  | 'firing_pending'   // client-side: waiting for server ack
  | 'active'
  | 'acknowledged'
  | 'dispatched'
  | 'resolved'
  | 'cancelled'
  | 'false_alarm';

export type AlertEvent =
  | { type: 'TRIGGER'; trigger: string; confidence: number; riskScore: number }
  | { type: 'COUNTDOWN_TIMEOUT' }
  | { type: 'FIRE_NOW' }
  | { type: 'SERVER_ACK' }
  | { type: 'POLICE_ACKNOWLEDGE'; etaMinutes?: number }
  | { type: 'DISPATCH'; note?: string }
  | { type: 'RESOLVE'; outcome?: string }
  | { type: 'PIN_CANCEL'; duress: boolean }
  | { type: 'MARK_FALSE_ALARM' };

export interface AlertState {
  status: AlertStatus;
  duress: boolean;
  escalationLevel: number;
  trigger?: string;
  confidence?: number;
  riskScore?: number;
  etaMinutes?: number;
}

const TERMINAL: Set<AlertStatus> = new Set([
  'resolved',
  'cancelled',
  'false_alarm',
]);

const ACTIVE_STATUSES: Set<AlertStatus> = new Set([
  'active',
  'acknowledged',
  'dispatched',
]);

export class AlertTransitionError extends Error {
  constructor(
    public readonly from: AlertStatus,
    public readonly event: AlertEvent['type'],
  ) {
    super(`Illegal alert transition: ${from} + ${event}`);
    this.name = 'AlertTransitionError';
  }
}

export const INITIAL_ALERT_STATE: AlertState = {
  status: 'idle',
  duress: false,
  escalationLevel: 0,
};

/**
 * Pure reducer — returns a new state, never mutates.
 * Throws AlertTransitionError on illegal transitions.
 */
export function alertReducer(
  state: AlertState,
  event: AlertEvent,
): AlertState {
  const { status } = state;

  // Terminal states reject all events
  if (TERMINAL.has(status)) {
    throw new AlertTransitionError(status, event.type);
  }

  switch (event.type) {
    case 'TRIGGER': {
      if (status !== 'idle') throw new AlertTransitionError(status, event.type);
      return {
        ...state,
        status: 'countdown',
        trigger: event.trigger,
        confidence: event.confidence,
        riskScore: event.riskScore,
      };
    }

    case 'COUNTDOWN_TIMEOUT':
    case 'FIRE_NOW': {
      if (status !== 'countdown') throw new AlertTransitionError(status, event.type);
      return { ...state, status: 'firing_pending' };
    }

    case 'SERVER_ACK': {
      if (status !== 'firing_pending') throw new AlertTransitionError(status, event.type);
      return { ...state, status: 'active' };
    }

    case 'POLICE_ACKNOWLEDGE': {
      if (status !== 'active') throw new AlertTransitionError(status, event.type);
      const next: AlertState = {
        ...state,
        status: 'acknowledged',
      };
      if (event.etaMinutes !== undefined) {
        next.etaMinutes = event.etaMinutes;
      }
      return next;
    }

    case 'DISPATCH': {
      if (status !== 'acknowledged') throw new AlertTransitionError(status, event.type);
      return { ...state, status: 'dispatched' };
    }

    case 'RESOLVE': {
      if (!ACTIVE_STATUSES.has(status)) throw new AlertTransitionError(status, event.type);
      return { ...state, status: 'resolved' };
    }

    case 'PIN_CANCEL': {
      // Duress: alert stays active, escalation_level=3; UI shows cancelled
      if (event.duress) {
        if (!ACTIVE_STATUSES.has(status) && status !== 'countdown') {
          throw new AlertTransitionError(status, event.type);
        }
        return {
          ...state,
          status: status === 'countdown' ? 'active' : status,
          duress: true,
          escalationLevel: 3,
        };
      }
      // Normal cancel
      if (status !== 'countdown') throw new AlertTransitionError(status, event.type);
      return { ...state, status: 'cancelled' };
    }

    case 'MARK_FALSE_ALARM': {
      if (!ACTIVE_STATUSES.has(status)) throw new AlertTransitionError(status, event.type);
      return { ...state, status: 'false_alarm' };
    }

    default: {
      const exhaustive: never = event;
      throw new Error(`Unhandled event: ${JSON.stringify(exhaustive)}`);
    }
  }
}
