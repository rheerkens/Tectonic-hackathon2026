export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger(minLevel: LogLevel = 'info'): Logger {
  const emit = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
    if (ORDER[level] < ORDER[minLevel]) return;
    const line = meta && Object.keys(meta).length > 0 ? `${message} ${JSON.stringify(meta)}` : message;
    const target = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    target(`[api] ${line}`);
  };
  return {
    debug: (m, meta) => emit('debug', m, meta),
    info: (m, meta) => emit('info', m, meta),
    warn: (m, meta) => emit('warn', m, meta),
    error: (m, meta) => emit('error', m, meta),
  };
}

export const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
