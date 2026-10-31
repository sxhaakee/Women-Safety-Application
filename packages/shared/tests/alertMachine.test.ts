import { describe, it, expect } from 'vitest';
import {
  alertReducer, INITIAL_ALERT_STATE, AlertTransitionError,
  type AlertState, type AlertEvent
} from '../src/alert/machine';

function apply(state: AlertState, event: AlertEvent): AlertState {
  return alertReducer(state, event);
}

const IDLE = INITIAL_ALERT_STATE;

describe('AlertStateMachine', () => {
  // ── Legal transitions ──────────────────────────────────────
  it('idle → countdown on TRIGGER', () => {
    const s = apply(IDLE, { type: 'TRIGGER', trigger: 'shake', confidence: 0.9, riskScore: 40 });
    expect(s.status).toBe('countdown');
  });

  it('countdown → firing_pending on COUNTDOWN_TIMEOUT', () => {
    const s1 = apply(IDLE, { type: 'TRIGGER', trigger: 'shake', confidence: 0.9, riskScore: 40 });
    const s2 = apply(s1, { type: 'COUNTDOWN_TIMEOUT' });
    expect(s2.status).toBe('firing_pending');
  });

  it('countdown → firing_pending on FIRE_NOW', () => {
    const s1 = apply(IDLE, { type: 'TRIGGER', trigger: 'shake', confidence: 0.9, riskScore: 40 });
    const s2 = apply(s1, { type: 'FIRE_NOW' });
    expect(s2.status).toBe('firing_pending');
  });

  it('firing_pending → active on SERVER_ACK', () => {
    let s = apply(IDLE, { type: 'TRIGGER', trigger: 'shake', confidence: 0.9, riskScore: 40 });
    s = apply(s, { type: 'COUNTDOWN_TIMEOUT' });
    s = apply(s, { type: 'SERVER_ACK' });
    expect(s.status).toBe('active');
  });

  it('active → acknowledged on POLICE_ACKNOWLEDGE', () => {
    let s = apply(IDLE, { type: 'TRIGGER', trigger: 'shake', confidence: 0.9, riskScore: 40 });
    s = apply(s, { type: 'COUNTDOWN_TIMEOUT' });
    s = apply(s, { type: 'SERVER_ACK' });
    s = apply(s, { type: 'POLICE_ACKNOWLEDGE', etaMinutes: 5 });
    expect(s.status).toBe('acknowledged');
    expect(s.etaMinutes).toBe(5);
  });

  it('acknowledged → dispatched on DISPATCH', () => {
    let s = apply(IDLE, { type: 'TRIGGER', trigger: 'shake', confidence: 0.9, riskScore: 40 });
    s = apply(s, { type: 'COUNTDOWN_TIMEOUT' });
    s = apply(s, { type: 'SERVER_ACK' });
    s = apply(s, { type: 'POLICE_ACKNOWLEDGE' });
    s = apply(s, { type: 'DISPATCH' });
    expect(s.status).toBe('dispatched');
  });

  it('dispatched → resolved on RESOLVE', () => {
    let s = apply(IDLE, { type: 'TRIGGER', trigger: 'shake', confidence: 0.9, riskScore: 40 });
    s = apply(s, { type: 'COUNTDOWN_TIMEOUT' });
    s = apply(s, { type: 'SERVER_ACK' });
    s = apply(s, { type: 'POLICE_ACKNOWLEDGE' });
    s = apply(s, { type: 'DISPATCH' });
    s = apply(s, { type: 'RESOLVE' });
    expect(s.status).toBe('resolved');
  });

  it('countdown → cancelled on PIN_CANCEL(duress=false)', () => {
    let s = apply(IDLE, { type: 'TRIGGER', trigger: 'shake', confidence: 0.9, riskScore: 40 });
    s = apply(s, { type: 'PIN_CANCEL', duress: false });
    expect(s.status).toBe('cancelled');
    expect(s.duress).toBe(false);
  });

  it('active → RESOLVE → resolved', () => {
    let s = apply(IDLE, { type: 'TRIGGER', trigger: 'shake', confidence: 0.9, riskScore: 40 });
    s = apply(s, { type: 'COUNTDOWN_TIMEOUT' });
    s = apply(s, { type: 'SERVER_ACK' });
    s = apply(s, { type: 'RESOLVE' });
    expect(s.status).toBe('resolved');
  });

  // ── Duress PIN ────────────────────────────────────────────
  it('countdown duress PIN → active with duress=true, escalationLevel=3', () => {
    let s = apply(IDLE, { type: 'TRIGGER', trigger: 'shake', confidence: 0.9, riskScore: 40 });
    s = apply(s, { type: 'PIN_CANCEL', duress: true });
    expect(s.status).toBe('active');
    expect(s.duress).toBe(true);
    expect(s.escalationLevel).toBe(3);
  });

  it('active duress PIN → stays active, escalationLevel=3', () => {
    let s = apply(IDLE, { type: 'TRIGGER', trigger: 'shake', confidence: 0.9, riskScore: 40 });
    s = apply(s, { type: 'COUNTDOWN_TIMEOUT' });
    s = apply(s, { type: 'SERVER_ACK' });
    s = apply(s, { type: 'PIN_CANCEL', duress: true });
    expect(s.status).toBe('active');
    expect(s.duress).toBe(true);
    expect(s.escalationLevel).toBe(3);
  });

  // ── False alarm ───────────────────────────────────────────
  it('active → false_alarm on MARK_FALSE_ALARM', () => {
    let s = apply(IDLE, { type: 'TRIGGER', trigger: 'shake', confidence: 0.9, riskScore: 40 });
    s = apply(s, { type: 'COUNTDOWN_TIMEOUT' });
    s = apply(s, { type: 'SERVER_ACK' });
    s = apply(s, { type: 'MARK_FALSE_ALARM' });
    expect(s.status).toBe('false_alarm');
  });

  // ── Illegal transitions (terminal states) ─────────────────
  const TERMINAL_STATUSES = ['resolved', 'cancelled', 'false_alarm'] as const;

  for (const status of TERMINAL_STATUSES) {
    it(`terminal ${status} rejects TRIGGER`, () => {
      const s: AlertState = { status, duress: false, escalationLevel: 0 };
      expect(() => alertReducer(s, { type: 'TRIGGER', trigger: 'shake', confidence: 0.9, riskScore: 40 }))
        .toThrow(AlertTransitionError);
    });

    it(`terminal ${status} rejects SERVER_ACK`, () => {
      const s: AlertState = { status, duress: false, escalationLevel: 0 };
      expect(() => alertReducer(s, { type: 'SERVER_ACK' }))
        .toThrow(AlertTransitionError);
    });
  }

  // ── Illegal from wrong state ──────────────────────────────
  it('idle → SERVER_ACK throws', () => {
    expect(() => alertReducer(IDLE, { type: 'SERVER_ACK' })).toThrow(AlertTransitionError);
  });

  it('idle → COUNTDOWN_TIMEOUT throws', () => {
    expect(() => alertReducer(IDLE, { type: 'COUNTDOWN_TIMEOUT' })).toThrow(AlertTransitionError);
  });

  it('active → COUNTDOWN_TIMEOUT throws', () => {
    let s = apply(IDLE, { type: 'TRIGGER', trigger: 'shake', confidence: 0.9, riskScore: 40 });
    s = apply(s, { type: 'COUNTDOWN_TIMEOUT' });
    s = apply(s, { type: 'SERVER_ACK' });
    expect(() => alertReducer(s, { type: 'COUNTDOWN_TIMEOUT' })).toThrow(AlertTransitionError);
  });

  it('idle → POLICE_ACKNOWLEDGE throws', () => {
    expect(() => alertReducer(IDLE, { type: 'POLICE_ACKNOWLEDGE' })).toThrow(AlertTransitionError);
  });

  it('countdown → POLICE_ACKNOWLEDGE throws', () => {
    const s = apply(IDLE, { type: 'TRIGGER', trigger: 'shake', confidence: 0.9, riskScore: 40 });
    expect(() => alertReducer(s, { type: 'POLICE_ACKNOWLEDGE' })).toThrow(AlertTransitionError);
  });

  it('idle → DISPATCH throws', () => {
    expect(() => alertReducer(IDLE, { type: 'DISPATCH' })).toThrow(AlertTransitionError);
  });

  it('active → DISPATCH throws (need ack first)', () => {
    let s = apply(IDLE, { type: 'TRIGGER', trigger: 'shake', confidence: 0.9, riskScore: 40 });
    s = apply(s, { type: 'COUNTDOWN_TIMEOUT' });
    s = apply(s, { type: 'SERVER_ACK' });
    expect(() => alertReducer(s, { type: 'DISPATCH' })).toThrow(AlertTransitionError);
  });

  it('idle → RESOLVE throws', () => {
    expect(() => alertReducer(IDLE, { type: 'RESOLVE' })).toThrow(AlertTransitionError);
  });

  it('countdown → PIN_CANCEL(duress=false) allowed; firing_pending PIN_CANCEL throws', () => {
    let s = apply(IDLE, { type: 'TRIGGER', trigger: 'shake', confidence: 0.9, riskScore: 40 });
    s = apply(s, { type: 'COUNTDOWN_TIMEOUT' });
    // firing_pending + normal cancel → throw
    expect(() => alertReducer(s, { type: 'PIN_CANCEL', duress: false })).toThrow(AlertTransitionError);
  });
});
