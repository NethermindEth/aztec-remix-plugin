import path from 'node:path';

/**
 * Resolve a user-provided file path safely within a base directory.
 * Rejects paths that escape the base via `..`, absolute paths, or null bytes.
 * Throws on invalid paths instead of silently normalizing them.
 */
export function safePath(baseDir: string, userPath: string): string {
  // Reject null bytes (can bypass checks in some runtimes)
  if (userPath.includes('\0')) {
    throw new Error(`Invalid file path: contains null byte`);
  }

  // Reject absolute paths
  if (path.isAbsolute(userPath)) {
    throw new Error(`Invalid file path: absolute paths not allowed (${userPath})`);
  }

  // Normalize and resolve
  const resolved = path.resolve(baseDir, userPath);

  // Ensure the resolved path is within the base directory
  const normalizedBase = path.resolve(baseDir) + path.sep;
  if (!resolved.startsWith(normalizedBase) && resolved !== path.resolve(baseDir)) {
    throw new Error(`Invalid file path: escapes project directory (${userPath})`);
  }

  return resolved;
}
