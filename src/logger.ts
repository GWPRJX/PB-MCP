import pino from 'pino';

/**
 * Structured logger writing JSON to stderr (fd 2).
 * Replaces all raw process.stderr.write() calls for machine-parseable output.
 */
export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? 'info',
    formatters: {
      level: (label) => ({ level: label }),
    },
  },
  pino.destination(2),
);
