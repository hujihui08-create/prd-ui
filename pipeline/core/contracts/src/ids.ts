export type ReqId = `REQ-${string}-${string}`;

export function reqId(domain: string, n: number): ReqId {
  return `REQ-${domain.toUpperCase()}-${String(n).padStart(3, "0")}`;
}
