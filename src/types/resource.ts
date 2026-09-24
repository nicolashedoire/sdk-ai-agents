/**
 * Read-only documents a server offers to MCP clients ("resources"). Unlike tools, which the
 * model decides to call, resources are listed by the client application and attached to a
 * conversation by the user or the application.
 */
export interface ResourceDescriptor {
  /** Stable address of the resource, e.g. `folder://handbook/onboarding.md`. */
  uri: string;
  /** Short name shown to users (usually the file name). */
  name: string;
  description?: string;
  mimeType?: string;
  /** Size in bytes, when known. */
  size?: number;
}

export interface ResourceContent {
  uri: string;
  mimeType?: string;
  /** Text content. Binary resources are not supported. */
  text: string;
}

/** A source of resources. Implementations must bound what they list and what they read. */
export interface ResourceProvider {
  /** Whether this provider serves the URI (used to route reads between providers). */
  handles(uri: string): boolean;
  /** Every resource offered, bounded by the provider's own limits. */
  list(): Promise<ResourceDescriptor[]>;
  /** Reads one resource. Throws when the URI is unknown or not allowed. */
  read(uri: string): Promise<ResourceContent>;
}
