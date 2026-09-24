/** Longest tool name accepted by every major model API and MCP client. */
export const MAX_TOOL_NAME_LENGTH = 64;

/**
 * Turns any label into a valid tool name: letters, digits, `_` and `-` only, at most 64
 * characters, never empty.
 */
export function toToolName(label: string): string {
  const cleaned = label
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return (cleaned || 'tool').slice(0, MAX_TOOL_NAME_LENGTH);
}

/** Hands out unique tool names: a repeated name gets `_2`, `_3`… within the length limit. */
export class ToolNameAllocator {
  private readonly used = new Set<string>();

  constructor(reserved: Iterable<string> = []) {
    for (const name of reserved) {
      this.used.add(name);
    }
  }

  allocate(label: string): string {
    const base = toToolName(label);
    let name = base;
    for (let index = 2; this.used.has(name); index++) {
      const suffix = `_${index}`;
      name = `${base.slice(0, MAX_TOOL_NAME_LENGTH - suffix.length)}${suffix}`;
    }
    this.used.add(name);
    return name;
  }
}

/** Adds an optional prefix (e.g. `docs_`) to a tool name, keeping it valid. */
export function prefixed(prefix: string | undefined, name: string): string {
  return toToolName(`${prefix ?? ''}${name}`);
}
