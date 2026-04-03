export function isServerErdId(id: string | undefined | null): id is string {
  return Boolean(id && /^\d+$/.test(id));
}
