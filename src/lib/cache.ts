export class SimpleCache<T> {
  private store = new Map<string, { value: T; expiresAt: number }>();
  constructor(private ttlMs: number) {}
  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) {return undefined; }
    if (hit.expiresAt < Date.now()) { this.store.delete(key); return undefined; }
    return hit.value;
  }
  set(key: string, value: T) {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
}
