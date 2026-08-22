/** Prevents an older asynchronous renderer construction from publishing after a newer selection. */
export class GenerationFence {
  private value = 0;

  begin(): number {
    this.value += 1;
    return this.value;
  }

  isCurrent(generation: number): boolean {
    return generation === this.value;
  }

  cancel(): void {
    this.value += 1;
  }
}
