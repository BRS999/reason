export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function now(): string {
  return new Date().toISOString();
}
