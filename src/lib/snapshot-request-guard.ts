export class SnapshotRequestGuard {
  private latestRequest = 0;
  private mutationRequest?: number;

  beginRead(): number | undefined {
    if (this.mutationRequest !== undefined) return undefined;
    this.latestRequest += 1;
    return this.latestRequest;
  }

  beginMutation(): number {
    this.latestRequest += 1;
    this.mutationRequest = this.latestRequest;
    return this.latestRequest;
  }

  isCurrent(requestId: number): boolean {
    return requestId === this.latestRequest;
  }

  endMutation(requestId: number) {
    if (this.mutationRequest === requestId) this.mutationRequest = undefined;
  }
}
