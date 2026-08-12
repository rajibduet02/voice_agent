/**
 * Extract only safe error fields for logging.
 * Never JSON.stringify unknown Vapi errors (may contain credentials/metadata).
 */
export function sanitizeError(error: unknown): { name?: string; message: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  if (typeof error === 'object' && error !== null) {
    return {
      message:
        'message' in error && error.message != null
          ? String(error.message)
          : 'Unknown Vapi error',
    };
  }

  return {
    message: String(error),
  };
}
