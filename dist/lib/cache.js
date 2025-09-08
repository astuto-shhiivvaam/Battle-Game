export class SimpleCache {
    ttlMs;
    store = new Map();
    constructor(ttlMs) {
        this.ttlMs = ttlMs;
    }
    get(key) {
        const hit = this.store.get(key);
        if (!hit)
            return undefined;
        if (hit.expiresAt < Date.now()) {
            this.store.delete(key);
            return undefined;
        }
        return hit.value;
    }
    set(key, value) {
        this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    }
}
