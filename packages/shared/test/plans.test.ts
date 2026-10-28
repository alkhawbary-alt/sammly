import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAN_FEATURES, PlanFeatures, planRank } from '../src';

describe('plans', () => {
  it('ranks plans BASIC < BUSINESS < PRO', () => {
    expect(planRank('BASIC')).toBeLessThan(planRank('BUSINESS'));
    expect(planRank('BUSINESS')).toBeLessThan(planRank('PRO'));
  });

  it('default features satisfy the schema', () => {
    for (const f of Object.values(DEFAULT_PLAN_FEATURES)) {
      expect(PlanFeatures.parse(f)).toEqual(f);
    }
  });
});
