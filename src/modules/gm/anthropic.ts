import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { describeContext, GM_SYSTEM_PROMPT, type GmContextInput } from "./context";
import type { GmProvider, NarrateRequest } from "./provider";
import { InterpretationSchema, NarrationSchema } from "./schema";

/**
 * Claude-backed Game Master. Uses structured outputs so responses are parsed
 * against the protocol schemas; the orchestrator still re-validates them and
 * the engine still decides legality. Server-side only: the key never reaches
 * the browser.
 */
export class AnthropicGmProvider implements GmProvider {
  readonly id = "anthropic";
  private client: Anthropic;

  constructor(
    private model: string,
    apiKey?: string,
  ) {
    this.client = new Anthropic(apiKey ? { apiKey } : {});
  }

  async interpret(input: GmContextInput, playerText: string, signal?: AbortSignal) {
    const response = await this.client.beta.messages.parse(
      {
        model: this.model,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: betaZodOutputFormat(InterpretationSchema) },
        system: [{ type: "text", text: GM_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [
          {
            role: "user",
            content: `${describeContext(input, playerText)}\n\n# Tarefa: INTERPRETAR\nTraduza a fala do jogador em UMA intenção estruturada. Use somente ids presentes acima. Campos não usados devem ser null.\nJogador: """${playerText}"""`,
          },
        ],
      },
      { signal },
    );
    if (response.stop_reason === "refusal") throw new Error("A IA recusou interpretar esta ação.");
    return response.parsed_output;
  }

  async narrate(req: NarrateRequest, signal?: AbortSignal) {
    const facts = req.outcome ? req.outcome.facts.map((f) => `- ${f}`).join("\n") : "- Início da cena.";
    const response = await this.client.beta.messages.parse(
      {
        model: this.model,
        max_tokens: 6000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: betaZodOutputFormat(NarrationSchema) },
        system: [{ type: "text", text: GM_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [
          {
            role: "user",
            content: `${describeContext(req.input)}\n\n# Tarefa: NARRAR\nAção do jogador: ${req.playerText ?? "(abertura de cena)"}\nFATOS AUTORITATIVOS (não contradiga, não acrescente mecânicas):\n${facts}\nEscreva a narração e falas de NPC (npcId válido do contexto). Efeitos só da lista permitida.`,
          },
        ],
      },
      { signal },
    );
    if (response.stop_reason === "refusal") throw new Error("A IA recusou narrar esta cena.");
    return response.parsed_output;
  }
}
