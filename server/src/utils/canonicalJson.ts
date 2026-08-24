/**
 * Deterministic Key-Sorted Canonical JSON Serializer (SPEC §13.2, Invariant 1)
 */

export function canonicalJson(obj: unknown, seen = new WeakSet()): string {
  if (obj === null || obj === undefined) {
    return 'null';
  }
  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return JSON.stringify(obj);
  }
  if (typeof obj === 'string') {
    return JSON.stringify(obj);
  }
  if (obj instanceof Date) {
    return JSON.stringify(obj.toISOString());
  }

  // Handle Mongoose documents / BSON types
  if (typeof obj === 'object') {
    if (obj !== null && ('_bsontype' in obj || ('_id' in obj && !('toObject' in obj) && Object.keys(obj).length === 1))) {
      return JSON.stringify(String(obj));
    }
    if (typeof (obj as any).toJSON === 'function') {
      return canonicalJson((obj as any).toJSON(), seen);
    }
    if (typeof (obj as any).toObject === 'function') {
      return canonicalJson((obj as any).toObject(), seen);
    }
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => canonicalJson(item, seen)).join(',') + ']';
  }

  if (typeof obj === 'object') {
    if (seen.has(obj as object)) {
      return '"[Circular]"';
    }
    seen.add(obj as object);

    const rawKeys = Object.keys(obj as Record<string, unknown>);
    // Filter out internal Mongoose keys starting with $ or _v
    const keys = rawKeys
      .filter((k) => !k.startsWith('$') && k !== '__v')
      .sort();

    const entries: string[] = [];
    for (const key of keys) {
      const val = (obj as Record<string, unknown>)[key];
      if (val !== undefined && typeof val !== 'function') {
        entries.push(`${JSON.stringify(key)}:${canonicalJson(val, seen)}`);
      }
    }
    return '{' + entries.join(',') + '}';
  }

  return JSON.stringify(obj);
}
