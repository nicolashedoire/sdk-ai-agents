import type { LLMRequest } from './llm-provider.js';

/**
 * Relays the text a request streams (`onTextDelta`) through the attempts a wrapper makes for
 * it: retries, fallbacks. Each attempt gets callbacks of its own, and what an attempt still
 * sends once it has ended is dropped. When an attempt that streamed text failed and another
 * one follows, `restart()` tells the caller that this text is void (`onTextRestart`).
 */
export class StreamedTextRelay {
  private attempt = 0;
  /** Whether the current attempt streamed text since it began or since its last restart. */
  private streamed = false;

  constructor(private readonly request: LLMRequest) {}

  /** `request` with callbacks bound to a new attempt; unchanged when nobody streams. */
  begin(request: LLMRequest = this.request): LLMRequest {
    const { onTextDelta, onTextRestart } = this.request;
    if (!onTextDelta) {
      return request;
    }
    this.attempt++;
    this.streamed = false;
    const attempt = this.attempt;
    return {
      ...request,
      onTextDelta: (delta) => {
        if (attempt !== this.attempt) return;
        if (delta !== '') this.streamed = true;
        onTextDelta(delta);
      },
      // A restart inside the attempt (a retry of a provider in a fallback chain) voids its
      // text so far: the caller hears of it, and there is nothing left to void for this attempt.
      onTextRestart: () => {
        if (attempt !== this.attempt || !this.streamed) return;
        this.streamed = false;
        onTextRestart?.();
      },
    };
  }

  /** Ends the current attempt, which failed: if it streamed text, the caller discards it. */
  restart(): void {
    this.attempt++;
    if (this.streamed) {
      this.streamed = false;
      this.request.onTextRestart?.();
    }
  }
}
