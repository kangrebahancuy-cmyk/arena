import type { OfflineReason } from '../boot/bootController';

/** 134 -> "2m 14s". Whole numbers only; sub-second precision is noise in a UI. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = seconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${rest}s`;
  return `${rest}s`;
}

/** Player-facing explanation of why the server cannot be used right now. */
export function describeOfflineReason(reason: OfflineReason): string {
  switch (reason.kind) {
    case 'network':
      return 'Could not reach the server.';
    case 'timeout':
      return 'The server did not answer in time.';
    case 'invalid-response':
      return 'The server sent a response this client cannot understand.';
    case 'http':
      if (reason.status === 429) {
        return 'Too many requests. Waiting a moment before trying again.';
      }
      if (reason.status !== undefined && reason.status >= 500) {
        // Typical when the dev proxy cannot reach a server that is not running.
        return `The server is not responding properly (HTTP ${reason.status}). Is it running?`;
      }
      return reason.message;
    case 'aborted':
    case 'unexpected':
      return reason.message;
  }
}
