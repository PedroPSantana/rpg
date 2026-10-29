import "server-only";
import { AnthropicGmProvider } from "./anthropic";
import { OfflineGmProvider } from "./offline";
import { GmOrchestrator } from "./orchestrator";

export function gmStatus() {
  const wanted = process.env.GM_PROVIDER ?? "offline";
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  const active = wanted === "anthropic" && hasKey ? "anthropic" : "offline";
  return { wanted, active, model: active === "anthropic" ? (process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5") : null, hasKey };
}

export function createGm(): GmOrchestrator {
  const status = gmStatus();
  const timeoutMs = Number(process.env.GM_TIMEOUT_MS ?? 45000);
  const provider = status.active === "anthropic" ? new AnthropicGmProvider(status.model!) : new OfflineGmProvider();
  return new GmOrchestrator(provider, { timeoutMs, retries: 1 });
}
