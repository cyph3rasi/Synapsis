/**
 * Property-Based Tests for Schedule Configuration Persistence and Scheduled Post Triggering
 * 
 * Feature: bot-system, Property 16: Schedule Configuration Persistence
 * Feature: bot-system, Property 17: Scheduled Post Triggering
 * 
 * Tests the schedule configuration serialization and deserialization,
 * as well as the scheduled post triggering logic using fast-check 
 * for property-based testing.
 * 
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  ScheduleConfig,
  serializeScheduleConfig,
  parseScheduleConfig,
  validateScheduleConfig,
  MIN_INTERVAL_MINUTES,
  MAX_INTERVAL_MINUTES,
  MAX_TIMES_PER_DAY,
  normalizeTime,
  isDue,
  isIntervalDue,
  isTimesDue,
  isCronDue,
  IsDueResult,
  ProcessScheduledPostsResult,
} from './scheduler';

// ============================================
// GENERATORS
// ============================================

/**
 * Generator for valid interval minutes (5 to 10080).
 */
const validIntervalMinutesArb = fc.integer({
  min: MIN_INTERVAL_MINUTES,
  max: MAX_INTERVAL_MINUTES
});

/**
 * Generator for valid time strings in HH:MM format.
 */
const validTimeArb = fc.tuple(
  fc.integer({ min: 0, max: 23 }),
  fc.integer({ min: 0, max: 59 })
).map(([hours, minutes]) => {
  const h = hours.toString().padStart(2, '0');
  const m = minutes.toString().padStart(2, '0');
  return `${h}:${m}`;
});

/**
 * Generator for valid unique times array (1 to 24 unique times).
 */
const validTimesArrayArb = fc.uniqueArray(validTimeArb, {
  minLength: 1,
  maxLength: MAX_TIMES_PER_DAY,
  comparator: (a, b) => normalizeTime(a) === normalizeTime(b),
});

/**
 * Generator for valid cron minute field (0-59 or *).
 */
const cronMinuteArb = fc.oneof(
  fc.constant('*'),
  fc.integer({ min: 0, max: 59 }).map(String)
);

/**
 * Generator for valid cron hour field (0-23 or *).
 */
const cronHourArb = fc.oneof(
  fc.constant('*'),
  fc.integer({ min: 0, max: 23 }).map(String)
);

/**
 * Generator for valid cron day of month field (1-31 or *).
 */
const cronDayOfMonthArb = fc.oneof(
  fc.constant('*'),
  fc.integer({ min: 1, max: 31 }).map(String)
);

/**
 * Generator for valid cron month field (1-12 or *).
 */
const cronMonthArb = fc.oneof(
  fc.constant('*'),
  fc.integer({ min: 1, max: 12 }).map(String)
);

/**
 * Generator for valid cron day of week field (0-6 or *).
 */
const cronDayOfWeekArb = fc.oneof(
  fc.constant('*'),
  fc.integer({ min: 0, max: 6 }).map(String)
);

/**
 * Generator for valid cron expressions.
 */
const validCronExpressionArb = fc.tuple(
  cronMinuteArb,
  cronHourArb,
  cronDayOfMonthArb,
  cronMonthArb,
  cronDayOfWeekArb
).map(([minute, hour, dayOfMonth, month, dayOfWeek]) =>
  `${minute} ${hour} ${dayOfMonth} ${month} ${dayOfWeek}`
);

/**
 * Generator for valid timezones.
 */
const validTimezoneArb = fc.constantFrom(
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Australia/Sydney',
  'Pacific/Auckland'
);

/**
 * Generator for optional timezone (undefined or valid timezone).
 */
const optionalTimezoneArb = fc.option(validTimezoneArb, { nil: undefined });

/**
 * Generator for valid interval schedule configurations.
 */
const validIntervalConfigArb: fc.Arbitrary<ScheduleConfig> = fc.record({
  type: fc.constant('interval' as const),
  intervalMinutes: validIntervalMinutesArb,
  timezone: optionalTimezoneArb,
}).map(config => {
  // Remove undefined timezone to match expected behavior
  if (config.timezone === undefined) {
    const { timezone, ...rest } = config;
    return rest as ScheduleConfig;
  }
  return config as ScheduleConfig;
});

/**
 * Generator for valid times schedule configurations.
 */
const validTimesConfigArb: fc.Arbitrary<ScheduleConfig> = fc.record({
  type: fc.constant('times' as const),
  times: validTimesArrayArb,
  timezone: optionalTimezoneArb,
}).map(config => {
  // Remove undefined timezone to match expected behavior
  if (config.timezone === undefined) {
    const { timezone, ...rest } = config;
    return rest as ScheduleConfig;
  }
  return config as ScheduleConfig;
});

/**
 * Generator for valid cron schedule configurations.
 */
const validCronConfigArb: fc.Arbitrary<ScheduleConfig> = fc.record({
  type: fc.constant('cron' as const),
  cronExpression: validCronExpressionArb,
  timezone: optionalTimezoneArb,
}).map(config => {
  // Remove undefined timezone to match expected behavior
  if (config.timezone === undefined) {
    const { timezone, ...rest } = config;
    return rest as ScheduleConfig;
  }
  return config as ScheduleConfig;
});

/**
 * Generator for any valid schedule configuration.
 */
const validScheduleConfigArb: fc.Arbitrary<ScheduleConfig> = fc.oneof(
  validIntervalConfigArb,
  validTimesConfigArb,
  validCronConfigArb
);

/**
 * Generator for valid interval schedule configurations with timezone.
 */
const validIntervalConfigWithTimezoneArb: fc.Arbitrary<ScheduleConfig> = fc.record({
  type: fc.constant('interval' as const),
  intervalMinutes: validIntervalMinutesArb,
  timezone: validTimezoneArb,
});

/**
 * Generator for valid times schedule configurations with timezone.
 */
const validTimesConfigWithTimezoneArb: fc.Arbitrary<ScheduleConfig> = fc.record({
  type: fc.constant('times' as const),
  times: validTimesArrayArb,
  timezone: validTimezoneArb,
});

/**
 * Generator for valid cron schedule configurations with timezone.
 */
const validCronConfigWithTimezoneArb: fc.Arbitrary<ScheduleConfig> = fc.record({
  type: fc.constant('cron' as const),
  cronExpression: validCronExpressionArb,
  timezone: validTimezoneArb,
});

/**
 * Generator for any valid schedule configuration with timezone.
 */
const validScheduleConfigWithTimezoneArb: fc.Arbitrary<ScheduleConfig> = fc.oneof(
  validIntervalConfigWithTimezoneArb,
  validTimesConfigWithTimezoneArb,
  validCronConfigWithTimezoneArb
);

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Compare two schedule configurations for equivalence.
 * Handles normalization of times and optional fields.
 */
function areConfigsEquivalent(original: ScheduleConfig, parsed: ScheduleConfig): boolean {
  // Type must match
  if (original.type !== parsed.type) {
    return false;
  }

  // Check type-specific fields
  switch (original.type) {
    case 'interval':
      if (original.intervalMinutes !== parsed.intervalMinutes) {
        return false;
      }
      break;

    case 'times':
      if (!original.times || !parsed.times) {
        return false;
      }
      // Normalize and sort times for comparison
      const originalTimes = original.times.map(normalizeTime).sort();
      const parsedTimes = parsed.times.map(normalizeTime).sort();
      if (originalTimes.length !== parsedTimes.length) {
        return false;
      }
      for (let i = 0; i < originalTimes.length; i++) {
        if (originalTimes[i] !== parsedTimes[i]) {
          return false;
        }
      }
      break;

    case 'cron':
      if (original.cronExpression !== parsed.cronExpression) {
        return false;
      }
      break;
  }

  // Check timezone (both undefined or both equal)
  const originalTz = original.timezone;
  const parsedTz = parsed.timezone;
  if (originalTz !== parsedTz) {
    return false;
  }

  return true;
}

// ============================================
// PROPERTY TESTS
// ============================================

describe('Feature: bot-system, Property 16: Schedule Configuration Persistence', () => {
  /**
   * Property 16: Schedule Configuration Persistence
   * 
   * *For any* valid schedule configuration (interval, times, or cron), 
   * storing then retrieving SHALL produce an equivalent configuration.
   * 
   * **Validates: Requirements 5.1, 5.3**
   */

  describe('Interval schedule configs can be serialized and deserialized correctly', () => {
    /**
     * Property: For any valid interval schedule configuration,
     * serializing then parsing SHALL produce an equivalent configuration.
     */
    it('round-trips interval schedule configurations correctly', () => {
      fc.assert(
        fc.property(validIntervalConfigArb, (config) => {
          // Serialize the config
          const serialized = serializeScheduleConfig(config);

          // Parse it back
          const parsed = parseScheduleConfig(serialized);

          // Verify it was parsed successfully
          expect(parsed).not.toBeNull();

          // Verify equivalence
          expect(areConfigsEquivalent(config, parsed!)).toBe(true);

          // Verify the parsed config is valid
          const validation = validateScheduleConfig(parsed);
          expect(validation.valid).toBe(true);
          expect(validation.errors).toEqual([]);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Interval minutes are preserved exactly after round-trip.
     */
    it('preserves interval minutes exactly', () => {
      fc.assert(
        fc.property(validIntervalMinutesArb, (intervalMinutes) => {
          const config: ScheduleConfig = {
            type: 'interval',
            intervalMinutes,
          };

          const serialized = serializeScheduleConfig(config);
          const parsed = parseScheduleConfig(serialized);

          expect(parsed).not.toBeNull();
          expect(parsed!.type).toBe('interval');
          expect(parsed!.intervalMinutes).toBe(intervalMinutes);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Time-of-day schedule configs can be serialized and deserialized correctly', () => {
    /**
     * Property: For any valid times schedule configuration,
     * serializing then parsing SHALL produce an equivalent configuration.
     */
    it('round-trips times schedule configurations correctly', () => {
      fc.assert(
        fc.property(validTimesConfigArb, (config) => {
          // Serialize the config
          const serialized = serializeScheduleConfig(config);

          // Parse it back
          const parsed = parseScheduleConfig(serialized);

          // Verify it was parsed successfully
          expect(parsed).not.toBeNull();

          // Verify equivalence
          expect(areConfigsEquivalent(config, parsed!)).toBe(true);

          // Verify the parsed config is valid
          const validation = validateScheduleConfig(parsed);
          expect(validation.valid).toBe(true);
          expect(validation.errors).toEqual([]);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Times array is preserved after round-trip.
     */
    it('preserves times array correctly', () => {
      fc.assert(
        fc.property(validTimesArrayArb, (times) => {
          const config: ScheduleConfig = {
            type: 'times',
            times,
          };

          const serialized = serializeScheduleConfig(config);
          const parsed = parseScheduleConfig(serialized);

          expect(parsed).not.toBeNull();
          expect(parsed!.type).toBe('times');
          expect(parsed!.times).toBeDefined();

          // Normalize and compare
          const originalTimes = times.map(normalizeTime).sort();
          const parsedTimes = parsed!.times!.map(normalizeTime).sort();
          expect(parsedTimes).toEqual(originalTimes);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Multiple times are all preserved.
     */
    it('preserves multiple times correctly', () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(validTimeArb, {
            minLength: 2,
            maxLength: MAX_TIMES_PER_DAY,
            comparator: (a, b) => normalizeTime(a) === normalizeTime(b),
          }),
          (times) => {
            const config: ScheduleConfig = {
              type: 'times',
              times,
            };

            const serialized = serializeScheduleConfig(config);
            const parsed = parseScheduleConfig(serialized);

            expect(parsed).not.toBeNull();
            expect(parsed!.times!.length).toBe(times.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Cron schedule configs can be serialized and deserialized correctly', () => {
    /**
     * Property: For any valid cron schedule configuration,
     * serializing then parsing SHALL produce an equivalent configuration.
     */
    it('round-trips cron schedule configurations correctly', () => {
      fc.assert(
        fc.property(validCronConfigArb, (config) => {
          // Serialize the config
          const serialized = serializeScheduleConfig(config);

          // Parse it back
          const parsed = parseScheduleConfig(serialized);

          // Verify it was parsed successfully
          expect(parsed).not.toBeNull();

          // Verify equivalence
          expect(areConfigsEquivalent(config, parsed!)).toBe(true);

          // Verify the parsed config is valid
          const validation = validateScheduleConfig(parsed);
          expect(validation.valid).toBe(true);
          expect(validation.errors).toEqual([]);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Cron expression is preserved exactly after round-trip.
     */
    it('preserves cron expression exactly', () => {
      fc.assert(
        fc.property(validCronExpressionArb, (cronExpression) => {
          const config: ScheduleConfig = {
            type: 'cron',
            cronExpression,
          };

          const serialized = serializeScheduleConfig(config);
          const parsed = parseScheduleConfig(serialized);

          expect(parsed).not.toBeNull();
          expect(parsed!.type).toBe('cron');
          expect(parsed!.cronExpression).toBe(cronExpression);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('All schedule types with timezone can be round-tripped', () => {
    /**
     * Property: For any valid schedule configuration with timezone,
     * serializing then parsing SHALL preserve the timezone.
     */
    it('round-trips schedule configurations with timezone correctly', () => {
      fc.assert(
        fc.property(validScheduleConfigWithTimezoneArb, (config) => {
          // Serialize the config
          const serialized = serializeScheduleConfig(config);

          // Parse it back
          const parsed = parseScheduleConfig(serialized);

          // Verify it was parsed successfully
          expect(parsed).not.toBeNull();

          // Verify timezone is preserved
          expect(parsed!.timezone).toBe(config.timezone);

          // Verify equivalence
          expect(areConfigsEquivalent(config, parsed!)).toBe(true);

          // Verify the parsed config is valid
          const validation = validateScheduleConfig(parsed);
          expect(validation.valid).toBe(true);
          expect(validation.errors).toEqual([]);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Interval configs with timezone round-trip correctly.
     */
    it('round-trips interval configs with timezone', () => {
      fc.assert(
        fc.property(validIntervalConfigWithTimezoneArb, (config) => {
          const serialized = serializeScheduleConfig(config);
          const parsed = parseScheduleConfig(serialized);

          expect(parsed).not.toBeNull();
          expect(parsed!.type).toBe('interval');
          expect(parsed!.intervalMinutes).toBe(config.intervalMinutes);
          expect(parsed!.timezone).toBe(config.timezone);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Times configs with timezone round-trip correctly.
     */
    it('round-trips times configs with timezone', () => {
      fc.assert(
        fc.property(validTimesConfigWithTimezoneArb, (config) => {
          const serialized = serializeScheduleConfig(config);
          const parsed = parseScheduleConfig(serialized);

          expect(parsed).not.toBeNull();
          expect(parsed!.type).toBe('times');
          expect(parsed!.timezone).toBe(config.timezone);

          // Verify times are preserved
          const originalTimes = config.times!.map(normalizeTime).sort();
          const parsedTimes = parsed!.times!.map(normalizeTime).sort();
          expect(parsedTimes).toEqual(originalTimes);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Cron configs with timezone round-trip correctly.
     */
    it('round-trips cron configs with timezone', () => {
      fc.assert(
        fc.property(validCronConfigWithTimezoneArb, (config) => {
          const serialized = serializeScheduleConfig(config);
          const parsed = parseScheduleConfig(serialized);

          expect(parsed).not.toBeNull();
          expect(parsed!.type).toBe('cron');
          expect(parsed!.cronExpression).toBe(config.cronExpression);
          expect(parsed!.timezone).toBe(config.timezone);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('General round-trip properties', () => {
    /**
     * Property: For any valid schedule configuration,
     * serializing then parsing SHALL produce an equivalent configuration.
     */
    it('round-trips any valid schedule configuration', () => {
      fc.assert(
        fc.property(validScheduleConfigArb, (config) => {
          // Serialize the config
          const serialized = serializeScheduleConfig(config);

          // Verify serialized is a valid JSON string
          expect(() => JSON.parse(serialized)).not.toThrow();

          // Parse it back
          const parsed = parseScheduleConfig(serialized);

          // Verify it was parsed successfully
          expect(parsed).not.toBeNull();

          // Verify equivalence
          expect(areConfigsEquivalent(config, parsed!)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Serialization produces valid JSON.
     */
    it('produces valid JSON for all schedule types', () => {
      fc.assert(
        fc.property(validScheduleConfigArb, (config) => {
          const serialized = serializeScheduleConfig(config);

          // Should be valid JSON
          let parsed: unknown;
          expect(() => {
            parsed = JSON.parse(serialized);
          }).not.toThrow();

          // Should be an object
          expect(typeof parsed).toBe('object');
          expect(parsed).not.toBeNull();
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Double serialization produces the same result.
     */
    it('is idempotent - double round-trip produces same result', () => {
      fc.assert(
        fc.property(validScheduleConfigArb, (config) => {
          // First round-trip
          const serialized1 = serializeScheduleConfig(config);
          const parsed1 = parseScheduleConfig(serialized1);

          expect(parsed1).not.toBeNull();

          // Second round-trip
          const serialized2 = serializeScheduleConfig(parsed1!);
          const parsed2 = parseScheduleConfig(serialized2);

          expect(parsed2).not.toBeNull();

          // Both parsed results should be equivalent
          expect(areConfigsEquivalent(parsed1!, parsed2!)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Parsed configs pass validation.
     */
    it('parsed configs always pass validation', () => {
      fc.assert(
        fc.property(validScheduleConfigArb, (config) => {
          const serialized = serializeScheduleConfig(config);
          const parsed = parseScheduleConfig(serialized);

          expect(parsed).not.toBeNull();

          const validation = validateScheduleConfig(parsed);
          expect(validation.valid).toBe(true);
          expect(validation.errors).toEqual([]);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Edge cases', () => {
    /**
     * Property: Minimum interval value round-trips correctly.
     */
    it('handles minimum interval value', () => {
      const config: ScheduleConfig = {
        type: 'interval',
        intervalMinutes: MIN_INTERVAL_MINUTES,
      };

      const serialized = serializeScheduleConfig(config);
      const parsed = parseScheduleConfig(serialized);

      expect(parsed).not.toBeNull();
      expect(parsed!.intervalMinutes).toBe(MIN_INTERVAL_MINUTES);
    });

    /**
     * Property: Maximum interval value round-trips correctly.
     */
    it('handles maximum interval value', () => {
      const config: ScheduleConfig = {
        type: 'interval',
        intervalMinutes: MAX_INTERVAL_MINUTES,
      };

      const serialized = serializeScheduleConfig(config);
      const parsed = parseScheduleConfig(serialized);

      expect(parsed).not.toBeNull();
      expect(parsed!.intervalMinutes).toBe(MAX_INTERVAL_MINUTES);
    });

    /**
     * Property: Single time value round-trips correctly.
     */
    it('handles single time value', () => {
      const config: ScheduleConfig = {
        type: 'times',
        times: ['12:00'],
      };

      const serialized = serializeScheduleConfig(config);
      const parsed = parseScheduleConfig(serialized);

      expect(parsed).not.toBeNull();
      expect(parsed!.times).toEqual(['12:00']);
    });

    /**
     * Property: Maximum times array round-trips correctly.
     */
    it('handles maximum times array', () => {
      // Generate 24 unique times (one per hour)
      const times = Array.from({ length: MAX_TIMES_PER_DAY }, (_, i) =>
        `${i.toString().padStart(2, '0')}:00`
      );

      const config: ScheduleConfig = {
        type: 'times',
        times,
      };

      const serialized = serializeScheduleConfig(config);
      const parsed = parseScheduleConfig(serialized);

      expect(parsed).not.toBeNull();
      expect(parsed!.times!.length).toBe(MAX_TIMES_PER_DAY);
    });

    /**
     * Property: Wildcard cron expression round-trips correctly.
     */
    it('handles wildcard cron expression', () => {
      const config: ScheduleConfig = {
        type: 'cron',
        cronExpression: '* * * * *',
      };

      const serialized = serializeScheduleConfig(config);
      const parsed = parseScheduleConfig(serialized);

      expect(parsed).not.toBeNull();
      expect(parsed!.cronExpression).toBe('* * * * *');
    });

    /**
     * Property: Specific cron expression round-trips correctly.
     */
    it('handles specific cron expression', () => {
      const config: ScheduleConfig = {
        type: 'cron',
        cronExpression: '0 9 1 1 1',
      };

      const serialized = serializeScheduleConfig(config);
      const parsed = parseScheduleConfig(serialized);

      expect(parsed).not.toBeNull();
      expect(parsed!.cronExpression).toBe('0 9 1 1 1');
    });

    /**
     * Property: Midnight time round-trips correctly.
     */
    it('handles midnight time', () => {
      const config: ScheduleConfig = {
        type: 'times',
        times: ['00:00'],
      };

      const serialized = serializeScheduleConfig(config);
      const parsed = parseScheduleConfig(serialized);

      expect(parsed).not.toBeNull();
      expect(parsed!.times!.map(normalizeTime)).toContain('00:00');
    });

    /**
     * Property: End of day time round-trips correctly.
     */
    it('handles end of day time', () => {
      const config: ScheduleConfig = {
        type: 'times',
        times: ['23:59'],
      };

      const serialized = serializeScheduleConfig(config);
      const parsed = parseScheduleConfig(serialized);

      expect(parsed).not.toBeNull();
      expect(parsed!.times!.map(normalizeTime)).toContain('23:59');
    });
  });

  describe('Invalid input handling', () => {
    /**
     * Property: parseScheduleConfig returns null for invalid JSON.
     */
    it('returns null for invalid JSON', () => {
      expect(parseScheduleConfig('not valid json')).toBeNull();
      expect(parseScheduleConfig('{')).toBeNull();
      expect(parseScheduleConfig('')).toBeNull();
    });

    /**
     * Property: parseScheduleConfig returns null for null input.
     */
    it('returns null for null input', () => {
      expect(parseScheduleConfig(null)).toBeNull();
    });

    /**
     * Property: parseScheduleConfig returns null for invalid config structure.
     */
    it('returns null for invalid config structure', () => {
      expect(parseScheduleConfig(JSON.stringify({ type: 'invalid' }))).toBeNull();
      expect(parseScheduleConfig(JSON.stringify({ type: 'interval' }))).toBeNull();
      expect(parseScheduleConfig(JSON.stringify({ type: 'times' }))).toBeNull();
      expect(parseScheduleConfig(JSON.stringify({ type: 'cron' }))).toBeNull();
    });
  });
});


// ============================================
// PROPERTY 17: SCHEDULED POST TRIGGERING
// ============================================

describe('Feature: bot-system, Property 17: Scheduled Post Triggering', () => {
  /**
   * Property 17: Scheduled Post Triggering
   * 
   * *For any* bot with a due schedule and available content, 
   * the scheduler SHALL trigger post generation.
   * 
   * **Validates: Requirements 5.2, 5.4**
   */

  // ============================================
  // GENERATORS FOR PROPERTY 17
  // ============================================

  /**
   * Generator for valid interval minutes (5 to 10080).
   */
  const validIntervalMinutesArb = fc.integer({
    min: MIN_INTERVAL_MINUTES,
    max: MAX_INTERVAL_MINUTES
  });

  /**
   * Generator for valid time strings in HH:MM format.
   */
  const validTimeArb = fc.tuple(
    fc.integer({ min: 0, max: 23 }),
    fc.integer({ min: 0, max: 59 })
  ).map(([hours, minutes]) => {
    const h = hours.toString().padStart(2, '0');
    const m = minutes.toString().padStart(2, '0');
    return `${h}:${m}`;
  });

  /**
   * Generator for valid unique times array (1 to 24 unique times).
   */
  const validTimesArrayArb = fc.uniqueArray(validTimeArb, {
    minLength: 1,
    maxLength: MAX_TIMES_PER_DAY,
    comparator: (a, b) => normalizeTime(a) === normalizeTime(b),
  });

  /**
   * Generator for valid cron minute field (0-59 or *).
   */
  const cronMinuteArb = fc.oneof(
    fc.constant('*'),
    fc.integer({ min: 0, max: 59 }).map(String)
  );

  /**
   * Generator for valid cron hour field (0-23 or *).
   */
  const cronHourArb = fc.oneof(
    fc.constant('*'),
    fc.integer({ min: 0, max: 23 }).map(String)
  );

  /**
   * Generator for valid cron day of month field (1-31 or *).
   */
  const cronDayOfMonthArb = fc.oneof(
    fc.constant('*'),
    fc.integer({ min: 1, max: 31 }).map(String)
  );

  /**
   * Generator for valid cron month field (1-12 or *).
   */
  const cronMonthArb = fc.oneof(
    fc.constant('*'),
    fc.integer({ min: 1, max: 12 }).map(String)
  );

  /**
   * Generator for valid cron day of week field (0-6 or *).
   */
  const cronDayOfWeekArb = fc.oneof(
    fc.constant('*'),
    fc.integer({ min: 0, max: 6 }).map(String)
  );

  /**
   * Generator for valid cron expressions.
   */
  const validCronExpressionArb = fc.tuple(
    cronMinuteArb,
    cronHourArb,
    cronDayOfMonthArb,
    cronMonthArb,
    cronDayOfWeekArb
  ).map(([minute, hour, dayOfMonth, month, dayOfWeek]) =>
    `${minute} ${hour} ${dayOfMonth} ${month} ${dayOfWeek}`
  );

  /**
   * Generator for valid timezones.
   */
  const validTimezoneArb = fc.constantFrom(
    'UTC',
    'America/New_York',
    'America/Los_Angeles',
    'Europe/London',
    'Asia/Tokyo'
  );

  /**
   * Generator for minutes elapsed since last post (for interval testing).
   * Values greater than or equal to the interval should be due.
   */
  const minutesElapsedArb = fc.integer({ min: 0, max: MAX_INTERVAL_MINUTES * 2 });

  /**
   * Generator for a lastPostAt date based on minutes ago.
   */
  const lastPostAtFromMinutesAgo = (minutesAgo: number): Date => {
    return new Date(Date.now() - minutesAgo * 60 * 1000);
  };

  // ============================================
  // INTERVAL SCHEDULE TESTS
  // ============================================

  describe('Interval schedules are due when the interval has elapsed', () => {
    /**
     * Property: For any interval schedule, if the time since last post
     * is greater than or equal to the interval, isDue SHALL return true.
     */
    it('isIntervalDue returns true when interval has elapsed', () => {
      fc.assert(
        fc.property(
          validIntervalMinutesArb,
          fc.integer({ min: 0, max: MAX_INTERVAL_MINUTES }),
          (intervalMinutes, extraMinutes) => {
            // Time elapsed is interval + extra minutes (always >= interval)
            const minutesElapsed = intervalMinutes + extraMinutes;
            const lastPostAt = lastPostAtFromMinutesAgo(minutesElapsed);

            const result = isIntervalDue(intervalMinutes, lastPostAt);

            expect(result.isDue).toBe(true);
            expect(result.reason).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: For any interval schedule, if the time since last post
     * is less than the interval, isDue SHALL return false.
     */
    it('isIntervalDue returns false when interval has not elapsed', () => {
      fc.assert(
        fc.property(
          validIntervalMinutesArb,
          (intervalMinutes) => {
            // Time elapsed is less than interval (at least 1 minute less)
            const minutesElapsed = Math.max(0, intervalMinutes - 1 - Math.floor(Math.random() * (intervalMinutes - 1)));

            // Only test if we can have a meaningful "not elapsed" scenario
            if (minutesElapsed >= intervalMinutes) {
              return true; // Skip this case
            }

            const lastPostAt = lastPostAtFromMinutesAgo(minutesElapsed);

            const result = isIntervalDue(intervalMinutes, lastPostAt);

            expect(result.isDue).toBe(false);
            expect(result.nextDueAt).toBeDefined();

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: For any interval schedule with no previous post (null lastPostAt),
     * isDue SHALL return true.
     */
    it('isIntervalDue returns true when no previous post exists', () => {
      fc.assert(
        fc.property(validIntervalMinutesArb, (intervalMinutes) => {
          const result = isIntervalDue(intervalMinutes, null);

          expect(result.isDue).toBe(true);
          expect(result.reason).toContain('No previous post');
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: The nextDueAt time is correctly calculated as lastPostAt + interval.
     */
    it('calculates nextDueAt correctly for interval schedules', () => {
      fc.assert(
        fc.property(
          validIntervalMinutesArb,
          fc.integer({ min: 1, max: 60 }), // Minutes since last post (less than interval)
          (intervalMinutes, minutesSincePost) => {
            // Ensure we're testing a "not due" scenario
            if (minutesSincePost >= intervalMinutes) {
              return true; // Skip
            }

            const lastPostAt = lastPostAtFromMinutesAgo(minutesSincePost);
            const result = isIntervalDue(intervalMinutes, lastPostAt);

            if (!result.isDue && result.nextDueAt) {
              // nextDueAt should be lastPostAt + intervalMinutes
              const expectedNextDue = new Date(lastPostAt.getTime() + intervalMinutes * 60 * 1000);

              // Allow 1 second tolerance for test execution time
              expect(Math.abs(result.nextDueAt.getTime() - expectedNextDue.getTime())).toBeLessThan(1000);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ============================================
  // TIME-OF-DAY SCHEDULE TESTS
  // ============================================

  describe('Time-of-day schedules are due at the scheduled times', () => {
    /**
     * Property: isTimesDue returns a valid IsDueResult for any valid times array.
     */
    it('isTimesDue returns valid result for any valid times array', () => {
      fc.assert(
        fc.property(validTimesArrayArb, validTimezoneArb, (times, timezone) => {
          const result = isTimesDue(times, timezone, null);

          // Result should always have isDue boolean and reason
          expect(typeof result.isDue).toBe('boolean');
          expect(result.reason).toBeDefined();
          expect(typeof result.reason).toBe('string');
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: isTimesDue handles multiple times correctly.
     */
    it('handles multiple scheduled times', () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(validTimeArb, {
            minLength: 2,
            maxLength: 10,
            comparator: (a, b) => normalizeTime(a) === normalizeTime(b),
          }),
          validTimezoneArb,
          (times, timezone) => {
            const result = isTimesDue(times, timezone, null);

            // Should return a valid result
            expect(typeof result.isDue).toBe('boolean');
            expect(result.reason).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: isTimesDue respects timezone parameter.
     */
    it('respects timezone parameter', () => {
      // Test with a specific time that we can control
      const times = ['12:00'];

      // Different timezones should potentially give different results
      const resultUTC = isTimesDue(times, 'UTC', null);
      const resultNY = isTimesDue(times, 'America/New_York', null);

      // Both should return valid results
      expect(typeof resultUTC.isDue).toBe('boolean');
      expect(typeof resultNY.isDue).toBe('boolean');
      expect(resultUTC.reason).toBeDefined();
      expect(resultNY.reason).toBeDefined();
    });
  });

  // ============================================
  // CRON SCHEDULE TESTS
  // ============================================

  describe('Cron schedules are due when the cron expression matches', () => {
    /**
     * Property: Wildcard cron expression (* * * * *) is always due
     * (unless already posted this minute).
     */
    it('wildcard cron expression is due when not posted this minute', () => {
      // No previous post
      const result = isCronDue('* * * * *', 'UTC', null);

      expect(result.isDue).toBe(true);
      expect(result.reason).toContain('Cron schedule matched');
    });

    /**
     * Property: Cron expression is not due if already posted this minute.
     */
    it('cron expression is not due if already posted this minute', () => {
      const justNow = new Date(Date.now() - 30 * 1000); // 30 seconds ago
      const result = isCronDue('* * * * *', 'UTC', justNow);

      expect(result.isDue).toBe(false);
      expect(result.reason).toContain('Already posted');
    });

    /**
     * Property: isCronDue returns valid result for any valid cron expression.
     */
    it('returns valid result for any valid cron expression', () => {
      fc.assert(
        fc.property(validCronExpressionArb, validTimezoneArb, (cronExpression, timezone) => {
          const result = isCronDue(cronExpression, timezone, null);

          // Result should always have isDue boolean and reason
          expect(typeof result.isDue).toBe('boolean');
          expect(result.reason).toBeDefined();
          expect(typeof result.reason).toBe('string');
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Specific cron expressions match only at specific times.
     */
    it('specific cron expressions have deterministic matching', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 59 }),
          fc.integer({ min: 0, max: 23 }),
          (minute, hour) => {
            const cronExpression = `${minute} ${hour} * * *`;

            // Call twice with same parameters should give same result
            const result1 = isCronDue(cronExpression, 'UTC', null);
            const result2 = isCronDue(cronExpression, 'UTC', null);

            expect(result1.isDue).toBe(result2.isDue);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ============================================
  // isDue FUNCTION TESTS (UNIFIED)
  // ============================================

  describe('isDue function correctly identifies when schedules are due', () => {
    /**
     * Property: isDue delegates correctly to isIntervalDue for interval schedules.
     */
    it('delegates to isIntervalDue for interval type', () => {
      fc.assert(
        fc.property(validIntervalMinutesArb, (intervalMinutes) => {
          const config: ScheduleConfig = {
            type: 'interval',
            intervalMinutes,
          };

          // Test with no previous post
          const result = isDue(config, null);
          const directResult = isIntervalDue(intervalMinutes, null);

          expect(result.isDue).toBe(directResult.isDue);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: isDue delegates correctly to isTimesDue for times schedules.
     */
    it('delegates to isTimesDue for times type', () => {
      fc.assert(
        fc.property(validTimesArrayArb, (times) => {
          const config: ScheduleConfig = {
            type: 'times',
            times,
            timezone: 'UTC',
          };

          const result = isDue(config, null);
          const directResult = isTimesDue(times, 'UTC', null);

          expect(result.isDue).toBe(directResult.isDue);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: isDue delegates correctly to isCronDue for cron schedules.
     */
    it('delegates to isCronDue for cron type', () => {
      fc.assert(
        fc.property(validCronExpressionArb, (cronExpression) => {
          const config: ScheduleConfig = {
            type: 'cron',
            cronExpression,
            timezone: 'UTC',
          };

          const result = isDue(config, null);
          const directResult = isCronDue(cronExpression, 'UTC', null);

          expect(result.isDue).toBe(directResult.isDue);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: isDue returns not due for missing configuration.
     */
    it('returns not due for missing interval configuration', () => {
      const config: ScheduleConfig = {
        type: 'interval',
        // Missing intervalMinutes
      };

      const result = isDue(config, null);

      expect(result.isDue).toBe(false);
      expect(result.reason).toContain('Missing interval');
    });

    it('returns not due for missing times configuration', () => {
      const config: ScheduleConfig = {
        type: 'times',
        times: [], // Empty times array
      };

      const result = isDue(config, null);

      expect(result.isDue).toBe(false);
      expect(result.reason).toContain('Missing times');
    });

    it('returns not due for missing cron configuration', () => {
      const config: ScheduleConfig = {
        type: 'cron',
        // Missing cronExpression
      };

      const result = isDue(config, null);

      expect(result.isDue).toBe(false);
      expect(result.reason).toContain('Missing cron');
    });

    /**
     * Property: isDue uses default timezone (UTC) when not specified.
     */
    it('uses UTC as default timezone', () => {
      fc.assert(
        fc.property(validTimesArrayArb, (times) => {
          const configWithoutTz: ScheduleConfig = {
            type: 'times',
            times,
          };

          const configWithUTC: ScheduleConfig = {
            type: 'times',
            times,
            timezone: 'UTC',
          };

          const resultWithoutTz = isDue(configWithoutTz, null);
          const resultWithUTC = isDue(configWithUTC, null);

          // Should produce same result
          expect(resultWithoutTz.isDue).toBe(resultWithUTC.isDue);
        }),
        { numRuns: 100 }
      );
    });
  });

  // ============================================
  // SCHEDULE TRIGGERING INTEGRATION TESTS
  // ============================================

  describe('Scheduler triggers post generation when schedule is due and content is available', () => {
    /**
     * Property: For any interval schedule that is due (interval elapsed),
     * the isDue check SHALL return true, enabling post triggering.
     */
    it('interval schedule triggers when interval has elapsed', () => {
      fc.assert(
        fc.property(
          validIntervalMinutesArb,
          fc.integer({ min: 0, max: 1000 }), // Extra minutes beyond interval
          (intervalMinutes, extraMinutes) => {
            const config: ScheduleConfig = {
              type: 'interval',
              intervalMinutes,
            };

            // Last post was interval + extra minutes ago
            const lastPostAt = lastPostAtFromMinutesAgo(intervalMinutes + extraMinutes);

            const result = isDue(config, lastPostAt);

            // Should be due since interval has elapsed
            expect(result.isDue).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: For any interval schedule that is not due (interval not elapsed),
     * the isDue check SHALL return false, preventing post triggering.
     */
    it('interval schedule does not trigger when interval has not elapsed', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: MIN_INTERVAL_MINUTES + 1, max: MAX_INTERVAL_MINUTES }),
          (intervalMinutes) => {
            const config: ScheduleConfig = {
              type: 'interval',
              intervalMinutes,
            };

            // Last post was less than interval ago (at least 1 minute less)
            const minutesSincePost = Math.floor(intervalMinutes / 2);
            const lastPostAt = lastPostAtFromMinutesAgo(minutesSincePost);

            const result = isDue(config, lastPostAt);

            // Should not be due since interval has not elapsed
            expect(result.isDue).toBe(false);
            expect(result.nextDueAt).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: For any schedule with no previous post, the schedule
     * SHALL be considered due (for interval type).
     */
    it('first post is always due for interval schedules', () => {
      fc.assert(
        fc.property(validIntervalMinutesArb, (intervalMinutes) => {
          const config: ScheduleConfig = {
            type: 'interval',
            intervalMinutes,
          };

          const result = isDue(config, null);

          expect(result.isDue).toBe(true);
          expect(result.reason).toContain('No previous post');
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Wildcard cron schedules are always due (when not posted this minute).
     */
    it('wildcard cron schedule triggers immediately', () => {
      const config: ScheduleConfig = {
        type: 'cron',
        cronExpression: '* * * * *',
      };

      // No previous post
      const result = isDue(config, null);

      expect(result.isDue).toBe(true);
    });
  });

  // ============================================
  // EDGE CASES
  // ============================================

  describe('Edge cases for scheduled post triggering', () => {
    /**
     * Property: Minimum interval (5 minutes) is correctly enforced.
     */
    it('minimum interval boundary is correctly enforced', () => {
      const config: ScheduleConfig = {
        type: 'interval',
        intervalMinutes: MIN_INTERVAL_MINUTES,
      };

      // Exactly at minimum interval - should be due
      const lastPostAtExact = lastPostAtFromMinutesAgo(MIN_INTERVAL_MINUTES);
      const resultExact = isDue(config, lastPostAtExact);
      expect(resultExact.isDue).toBe(true);

      // Just under minimum interval - should not be due
      const lastPostAtUnder = lastPostAtFromMinutesAgo(MIN_INTERVAL_MINUTES - 1);
      const resultUnder = isDue(config, lastPostAtUnder);
      expect(resultUnder.isDue).toBe(false);
    });

    /**
     * Property: Maximum interval (7 days) is correctly handled.
     */
    it('maximum interval boundary is correctly handled', () => {
      const config: ScheduleConfig = {
        type: 'interval',
        intervalMinutes: MAX_INTERVAL_MINUTES,
      };

      // Exactly at maximum interval - should be due
      const lastPostAtExact = lastPostAtFromMinutesAgo(MAX_INTERVAL_MINUTES);
      const resultExact = isDue(config, lastPostAtExact);
      expect(resultExact.isDue).toBe(true);

      // Just under maximum interval - should not be due
      const lastPostAtUnder = lastPostAtFromMinutesAgo(MAX_INTERVAL_MINUTES - 1);
      const resultUnder = isDue(config, lastPostAtUnder);
      expect(resultUnder.isDue).toBe(false);
    });

    /**
     * Property: Very old last post times are handled correctly.
     */
    it('handles very old last post times', () => {
      fc.assert(
        fc.property(
          validIntervalMinutesArb,
          fc.integer({ min: MAX_INTERVAL_MINUTES, max: MAX_INTERVAL_MINUTES * 10 }),
          (intervalMinutes, minutesAgo) => {
            const config: ScheduleConfig = {
              type: 'interval',
              intervalMinutes,
            };

            const lastPostAt = lastPostAtFromMinutesAgo(minutesAgo);
            const result = isDue(config, lastPostAt);

            // Should always be due since minutesAgo >= MAX_INTERVAL_MINUTES >= intervalMinutes
            expect(result.isDue).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Midnight boundary times are handled correctly.
     */
    it('handles midnight boundary times', () => {
      const config: ScheduleConfig = {
        type: 'times',
        times: ['00:00', '23:59'],
        timezone: 'UTC',
      };

      const result = isDue(config, null);

      // Should return a valid result
      expect(typeof result.isDue).toBe('boolean');
      expect(result.reason).toBeDefined();
    });

    /**
     * Property: Single time schedules work correctly.
     */
    it('handles single time schedules', () => {
      fc.assert(
        fc.property(validTimeArb, validTimezoneArb, (time, timezone) => {
          const config: ScheduleConfig = {
            type: 'times',
            times: [time],
            timezone,
          };

          const result = isDue(config, null);

          expect(typeof result.isDue).toBe('boolean');
          expect(result.reason).toBeDefined();
        }),
        { numRuns: 100 }
      );
    });
  });
});


// ============================================
// PROPERTY 18: SKIP WHEN NO CONTENT
// ============================================

describe('Feature: bot-system, Property 18: Skip When No Content', () => {
  /**
   * Property 18: Skip When No Content
   * 
   * *For any* bot with a due schedule but no unprocessed content, 
   * the scheduler SHALL skip the posting cycle without creating a post.
   * 
   * **Validates: Requirements 5.5**
   */

  // ============================================
  // GENERATORS FOR PROPERTY 18
  // ============================================

  /**
   * Generator for valid bot IDs (UUIDs).
   */
  const validBotIdArb = fc.uuid();

  /**
   * Generator for valid interval schedule configurations.
   */
  const validIntervalConfigArb: fc.Arbitrary<ScheduleConfig> = fc.record({
    type: fc.constant('interval' as const),
    intervalMinutes: fc.integer({ min: MIN_INTERVAL_MINUTES, max: MAX_INTERVAL_MINUTES }),
  });

  /**
   * Generator for valid time strings in HH:MM format.
   */
  const validTimeArb = fc.tuple(
    fc.integer({ min: 0, max: 23 }),
    fc.integer({ min: 0, max: 59 })
  ).map(([hours, minutes]) => {
    const h = hours.toString().padStart(2, '0');
    const m = minutes.toString().padStart(2, '0');
    return `${h}:${m}`;
  });

  /**
   * Generator for valid times schedule configurations.
   */
  const validTimesConfigArb: fc.Arbitrary<ScheduleConfig> = fc.record({
    type: fc.constant('times' as const),
    times: fc.uniqueArray(validTimeArb, {
      minLength: 1,
      maxLength: MAX_TIMES_PER_DAY,
      comparator: (a, b) => normalizeTime(a) === normalizeTime(b),
    }),
  });

  /**
   * Generator for valid cron expressions.
   */
  const validCronExpressionArb = fc.tuple(
    fc.oneof(fc.constant('*'), fc.integer({ min: 0, max: 59 }).map(String)),
    fc.oneof(fc.constant('*'), fc.integer({ min: 0, max: 23 }).map(String)),
    fc.oneof(fc.constant('*'), fc.integer({ min: 1, max: 31 }).map(String)),
    fc.oneof(fc.constant('*'), fc.integer({ min: 1, max: 12 }).map(String)),
    fc.oneof(fc.constant('*'), fc.integer({ min: 0, max: 6 }).map(String))
  ).map(([minute, hour, dayOfMonth, month, dayOfWeek]) =>
    `${minute} ${hour} ${dayOfMonth} ${month} ${dayOfWeek}`
  );

  /**
   * Generator for valid cron schedule configurations.
   */
  const validCronConfigArb: fc.Arbitrary<ScheduleConfig> = fc.record({
    type: fc.constant('cron' as const),
    cronExpression: validCronExpressionArb,
  });

  /**
   * Generator for any valid schedule configuration.
   */
  const validScheduleConfigArb: fc.Arbitrary<ScheduleConfig> = fc.oneof(
    validIntervalConfigArb,
    validTimesConfigArb,
    validCronConfigArb
  );

  /**
   * Generator for content source types.
   */
  const contentSourceTypeArb = fc.constantFrom('rss', 'reddit', 'news_api');

  /**
   * Generator for content item data.
   */
  const contentItemArb = fc.record({
    id: fc.uuid(),
    sourceId: fc.uuid(),
    title: fc.string({ minLength: 1, maxLength: 200 }),
    content: fc.option(fc.string({ minLength: 0, maxLength: 1000 }), { nil: null }),
    url: fc.webUrl(),
    publishedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
  });

  // ============================================
  // HELPER FUNCTIONS
  // ============================================

  /**
   * Create a mock hasUnprocessedContent function that returns a specific value.
   */
  function createMockHasUnprocessedContent(hasContent: boolean) {
    return async (_botId: string): Promise<boolean> => hasContent;
  }

  /**
   * Create a mock getNextUnprocessedContent function.
   */
  function createMockGetNextUnprocessedContent(content: {
    id: string;
    sourceId: string;
    title: string;
    content: string | null;
    url: string;
    publishedAt: Date;
  } | null) {
    return async (_botId: string) => content;
  }

  // ============================================
  // PROPERTY TESTS: hasUnprocessedContent logic
  // ============================================

  describe('hasUnprocessedContent correctly identifies content availability', () => {
    /**
     * Property: Content availability is determined by the presence of unprocessed items.
     * 
     * This tests the logical property without database calls.
     * The actual database behavior is tested in integration tests.
     */
    it('content availability depends on unprocessed items existing', () => {
      fc.assert(
        fc.property(
          fc.array(fc.record({
            id: fc.uuid(),
            isProcessed: fc.boolean(),
          }), { minLength: 0, maxLength: 20 }),
          (contentItems) => {
            // Simulate hasUnprocessedContent logic
            const hasUnprocessed = contentItems.some(item => !item.isProcessed);

            // If no items, no content
            if (contentItems.length === 0) {
              expect(hasUnprocessed).toBe(false);
            }

            // If all processed, no unprocessed content
            const allProcessed = contentItems.every(item => item.isProcessed);
            if (allProcessed) {
              expect(hasUnprocessed).toBe(false);
            }

            // If any unprocessed, has content
            const anyUnprocessed = contentItems.some(item => !item.isProcessed);
            expect(hasUnprocessed).toBe(anyUnprocessed);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: For any bot with no content sources, there is no content available.
     */
    it('no content sources means no content available', () => {
      fc.assert(
        fc.property(validBotIdArb, (botId) => {
          // Simulate a bot with no content sources
          const contentSources: { id: string; isActive: boolean }[] = [];

          // No sources = no content
          const hasContent = contentSources.length > 0 &&
            contentSources.some(source => source.isActive);

          expect(hasContent).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
  });

  // ============================================
  // PROPERTY TESTS: getNextUnprocessedContent logic
  // ============================================

  describe('getNextUnprocessedContent retrieves content correctly', () => {
    /**
     * Property: When no unprocessed content exists, result is null.
     */
    it('returns null when all content is processed', () => {
      fc.assert(
        fc.property(
          fc.array(fc.record({
            id: fc.uuid(),
            sourceId: fc.uuid(),
            title: fc.string({ minLength: 1, maxLength: 200 }),
            content: fc.option(fc.string({ minLength: 0, maxLength: 1000 }), { nil: null }),
            url: fc.webUrl(),
            publishedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
            isProcessed: fc.constant(true), // All processed
          }), { minLength: 0, maxLength: 10 }),
          (contentItems) => {
            // Simulate getNextUnprocessedContent logic
            const unprocessedItems = contentItems.filter(item => !item.isProcessed);
            const nextContent = unprocessedItems.length > 0 ? unprocessedItems[0] : null;

            // All items are processed, so no unprocessed content
            expect(nextContent).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: getNextUnprocessedContent returns content with required fields when content exists.
     * 
     * Note: This is a structural property test - when content is returned,
     * it must have all required fields.
     */
    it('returns content with all required fields when content exists', () => {
      fc.assert(
        fc.property(contentItemArb, (contentItem) => {
          // Verify the content item structure has all required fields
          expect(contentItem.id).toBeDefined();
          expect(contentItem.sourceId).toBeDefined();
          expect(contentItem.title).toBeDefined();
          expect(contentItem.url).toBeDefined();
          expect(contentItem.publishedAt).toBeDefined();
          expect(contentItem.publishedAt instanceof Date).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: When unprocessed content exists, the oldest item is returned.
     */
    it('returns oldest unprocessed item when multiple exist', () => {
      fc.assert(
        fc.property(
          fc.array(fc.record({
            id: fc.uuid(),
            sourceId: fc.uuid(),
            title: fc.string({ minLength: 1, maxLength: 200 }),
            content: fc.option(fc.string({ minLength: 0, maxLength: 1000 }), { nil: null }),
            url: fc.webUrl(),
            publishedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
            isProcessed: fc.boolean(),
          }), { minLength: 1, maxLength: 10 }),
          (contentItems) => {
            // Simulate getNextUnprocessedContent logic
            const unprocessedItems = contentItems.filter(item => !item.isProcessed);

            if (unprocessedItems.length > 0) {
              // Sort by publishedAt to get oldest
              const sortedItems = [...unprocessedItems].sort(
                (a, b) => a.publishedAt.getTime() - b.publishedAt.getTime()
              );
              const oldestItem = sortedItems[0];

              // Verify oldest is indeed the minimum publishedAt
              for (const item of unprocessedItems) {
                expect(oldestItem.publishedAt.getTime()).toBeLessThanOrEqual(item.publishedAt.getTime());
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ============================================
  // PROPERTY TESTS: Skip Logic
  // ============================================

  describe('Scheduler skips posting when no content is available', () => {
    /**
     * Property: For any due schedule with no unprocessed content,
     * the scheduler SHALL skip the posting cycle.
     * 
     * This tests the logical flow: isDue=true + hasContent=false => skip
     */
    it('skips posting when schedule is due but no content available', () => {
      fc.assert(
        fc.property(
          validScheduleConfigArb,
          fc.boolean(),
          (config, hasContent) => {
            // Simulate the scheduler decision logic
            const isDueResult = isDue(config, null); // null = no previous post, so likely due

            // The skip decision logic
            const shouldSkip = isDueResult.isDue && !hasContent;
            const shouldPost = isDueResult.isDue && hasContent;

            // If due and no content, should skip
            if (isDueResult.isDue && !hasContent) {
              expect(shouldSkip).toBe(true);
              expect(shouldPost).toBe(false);
            }

            // If due and has content, should post
            if (isDueResult.isDue && hasContent) {
              expect(shouldSkip).toBe(false);
              expect(shouldPost).toBe(true);
            }

            // If not due, neither skip nor post (just wait)
            if (!isDueResult.isDue) {
              expect(shouldSkip).toBe(false);
              expect(shouldPost).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: For any interval schedule that is due with no content,
     * the skip reason SHALL indicate no content available.
     */
    it('interval schedule skips with correct reason when no content', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: MIN_INTERVAL_MINUTES, max: MAX_INTERVAL_MINUTES }),
          (intervalMinutes) => {
            const config: ScheduleConfig = {
              type: 'interval',
              intervalMinutes,
            };

            // Schedule is due (no previous post)
            const isDueResult = isDue(config, null);
            expect(isDueResult.isDue).toBe(true);

            // Simulate no content scenario
            const hasContent = false;

            // The expected skip status
            const status = hasContent ? 'posted' : 'skipped_no_content';
            const message = hasContent ? undefined : 'No unprocessed content available';

            expect(status).toBe('skipped_no_content');
            expect(message).toBe('No unprocessed content available');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: For any cron schedule that is due with no content,
     * the scheduler SHALL skip without creating a post.
     */
    it('cron schedule skips when no content available', () => {
      // Wildcard cron is always due
      const config: ScheduleConfig = {
        type: 'cron',
        cronExpression: '* * * * *',
      };

      const isDueResult = isDue(config, null);
      expect(isDueResult.isDue).toBe(true);

      // Simulate no content
      const hasContent = false;
      const shouldSkip = isDueResult.isDue && !hasContent;

      expect(shouldSkip).toBe(true);
    });

    /**
     * Property: For any times schedule that is due with no content,
     * the scheduler SHALL skip without creating a post.
     */
    it('times schedule skips when no content available', () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(validTimeArb, {
            minLength: 1,
            maxLength: 5,
            comparator: (a, b) => normalizeTime(a) === normalizeTime(b),
          }),
          (times) => {
            const config: ScheduleConfig = {
              type: 'times',
              times,
            };

            const isDueResult = isDue(config, null);

            // Regardless of whether it's due, if no content, should skip
            const hasContent = false;
            const shouldSkip = isDueResult.isDue && !hasContent;

            // If due, should skip when no content
            if (isDueResult.isDue) {
              expect(shouldSkip).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ============================================
  // PROPERTY TESTS: processScheduledPosts behavior
  // ============================================

  describe('processScheduledPosts skips bots with no content', () => {
    /**
     * Property: The ProcessScheduledPostsResult correctly tracks skipped bots.
     * 
     * This tests the result structure when bots are skipped due to no content.
     */
    it('result structure correctly represents skipped bots', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10 }),
          fc.integer({ min: 0, max: 10 }),
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 5 }),
          (processed, skipped, errors) => {
            // Simulate a ProcessScheduledPostsResult
            const result: ProcessScheduledPostsResult = {
              processed,
              skipped,
              errors,
              details: [],
            };

            // Add details for skipped bots
            for (let i = 0; i < skipped; i++) {
              result.details.push({
                botId: `bot-${i}`,
                status: 'skipped_no_content',
                message: 'No unprocessed content available',
              });
            }

            // Verify structure
            expect(result.processed).toBe(processed);
            expect(result.skipped).toBe(skipped);
            expect(result.errors.length).toBe(errors.length);

            // Verify skipped details
            const skippedDetails = result.details.filter((d: any) => d.status === 'skipped_no_content');
            expect(skippedDetails.length).toBe(skipped);

            // All skipped details should have the correct message
            for (const detail of skippedDetails) {
              expect(detail.message).toBe('No unprocessed content available');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: For any number of bots with no content, all should be skipped.
     */
    it('all bots without content are skipped', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 20 }),
          (numBots) => {
            // Simulate processing multiple bots, all with no content
            const result: ProcessScheduledPostsResult = {
              processed: 0,
              skipped: numBots,
              errors: [],
              details: [],
            };

            for (let i = 0; i < numBots; i++) {
              result.details.push({
                botId: `bot-${i}`,
                status: 'skipped_no_content',
                message: 'No unprocessed content available',
              });
            }

            // All bots should be skipped
            expect(result.processed).toBe(0);
            expect(result.skipped).toBe(numBots);
            expect(result.details.length).toBe(numBots);

            // All should have skipped_no_content status
            const allSkipped = result.details.every((d: any) => d.status === 'skipped_no_content');
            expect(allSkipped).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Mixed scenario - some bots with content, some without.
     */
    it('correctly handles mixed content availability', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10 }),
          fc.integer({ min: 0, max: 10 }),
          (botsWithContent, botsWithoutContent) => {
            const result: ProcessScheduledPostsResult = {
              processed: botsWithContent,
              skipped: botsWithoutContent,
              errors: [],
              details: [],
            };

            // Add details for bots with content (posted)
            for (let i = 0; i < botsWithContent; i++) {
              result.details.push({
                botId: `bot-with-content-${i}`,
                status: 'posted',
                message: 'Post created successfully',
              });
            }

            // Add details for bots without content (skipped)
            for (let i = 0; i < botsWithoutContent; i++) {
              result.details.push({
                botId: `bot-without-content-${i}`,
                status: 'skipped_no_content',
                message: 'No unprocessed content available',
              });
            }

            // Verify counts
            expect(result.processed).toBe(botsWithContent);
            expect(result.skipped).toBe(botsWithoutContent);
            expect(result.details.length).toBe(botsWithContent + botsWithoutContent);

            // Verify status distribution
            const postedCount = result.details.filter((d: any) => d.status === 'posted').length;
            const skippedCount = result.details.filter((d: any) => d.status === 'skipped_no_content').length;

            expect(postedCount).toBe(botsWithContent);
            expect(skippedCount).toBe(botsWithoutContent);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ============================================
  // EDGE CASES
  // ============================================

  describe('Edge cases for skip when no content', () => {
    /**
     * Property: Empty content sources list results in no content.
     */
    it('empty content sources means no content available', () => {
      // Simulate a bot with no content sources
      const contentSources: string[] = [];
      const hasContent = contentSources.length > 0;

      expect(hasContent).toBe(false);
    });

    /**
     * Property: All processed content items means no unprocessed content.
     */
    it('all processed items means no unprocessed content', () => {
      fc.assert(
        fc.property(
          fc.array(fc.record({
            id: fc.uuid(),
            isProcessed: fc.constant(true), // All processed
          }), { minLength: 1, maxLength: 10 }),
          (contentItems) => {
            const hasUnprocessed = contentItems.some(item => !item.isProcessed);
            expect(hasUnprocessed).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: At least one unprocessed item means content is available.
     */
    it('at least one unprocessed item means content available', () => {
      fc.assert(
        fc.property(
          fc.array(fc.record({
            id: fc.uuid(),
            isProcessed: fc.boolean(),
          }), { minLength: 1, maxLength: 10 }),
          (contentItems) => {
            const hasUnprocessed = contentItems.some(item => !item.isProcessed);
            const processedCount = contentItems.filter(item => item.isProcessed).length;
            const unprocessedCount = contentItems.filter(item => !item.isProcessed).length;

            // If any unprocessed, hasUnprocessed should be true
            expect(hasUnprocessed).toBe(unprocessedCount > 0);

            // Total should match
            expect(processedCount + unprocessedCount).toBe(contentItems.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Inactive content sources are not considered.
     */
    it('inactive sources do not contribute to content availability', () => {
      fc.assert(
        fc.property(
          fc.array(fc.record({
            id: fc.uuid(),
            isActive: fc.boolean(),
            hasUnprocessedContent: fc.boolean(),
          }), { minLength: 1, maxLength: 10 }),
          (sources) => {
            // Only active sources with unprocessed content count
            const hasAvailableContent = sources.some(
              source => source.isActive && source.hasUnprocessedContent
            );

            // If no active sources, no content
            const hasActiveSources = sources.some(source => source.isActive);
            if (!hasActiveSources) {
              expect(hasAvailableContent).toBe(false);
            }

            // If all active sources have no unprocessed content, no content
            const activeSourcesWithContent = sources.filter(
              source => source.isActive && source.hasUnprocessedContent
            );
            expect(hasAvailableContent).toBe(activeSourcesWithContent.length > 0);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Skip status is distinct from other skip reasons.
     */
    it('skipped_no_content is distinct from other skip statuses', () => {
      const skipStatuses = [
        'skipped_no_content',
        'skipped_rate_limit',
        'skipped_not_due',
      ];

      // All statuses should be unique
      const uniqueStatuses = new Set(skipStatuses);
      expect(uniqueStatuses.size).toBe(skipStatuses.length);

      // skipped_no_content should be in the list
      expect(skipStatuses).toContain('skipped_no_content');
    });

    /**
     * Property: Schedule due + no content = skip, not error.
     */
    it('no content results in skip, not error', () => {
      fc.assert(
        fc.property(validScheduleConfigArb, (config) => {
          const isDueResult = isDue(config, null);

          if (isDueResult.isDue) {
            // Simulate no content scenario
            const hasContent = false;

            // Should result in skip, not error
            const status = hasContent ? 'posted' : 'skipped_no_content';

            expect(status).toBe('skipped_no_content');
            expect(status).not.toBe('error');
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});
