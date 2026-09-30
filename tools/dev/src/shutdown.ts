export function createShutdown(
  cleanup: (reason: string, code: number) => Promise<void>,
): (reason: string, code?: number) => Promise<void> {
  let shutdownPromise: Promise<void> | null = null;
  return (reason, code = 0) => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = cleanup(reason, code);
    return shutdownPromise;
  };
}
