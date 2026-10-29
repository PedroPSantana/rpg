import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { describeContext, GM_SYSTEM_PROMPT, type GmContextInput } from "./context";
import type { Beat } from "@/modules/campaign/engine";
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
            content: `${describeContext(input, playerText)}\n\n# Tarefa: INTERPRETAR\nTraduza o que o jogador escreveu em UMA intenção estruturada e classifique o tipo de fala em "category". Use somente ids presentes acima. Campos não usados devem ser null. Não peça teste quando não houver incerteza real.\nJogador: """${playerText}"""`,
          },
        ],
      },
      { signal },
    );
    if (response.stop_reason === "refusal") throw new Error("A IA recusou interpretar esta ação.");
    return response.parsed_output;
  }

  async narrate(req: NarrateRequest, signal?: AbortSignal) {
    const beats = req.outcome.beats ?? req.outcome.facts.map((text): Beat => ({ kind: "narration", text }));
    const facts = beats.map((b) => `- [${b.kind}${b.npcId ? `:${b.npcId}` : ""}] ${b.text}`).join("\n") || "- Nada mudou no mundo.";
    const response = await this.client.beta.messages.parse(
      {
        model: this.model,
        max_tokens: 6000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: betaZodOutputFormat(NarrationSchema) },
        system: [{ type: "text", text: GM_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [
          {
            role: "user",
            content: `${describeContext(req.input)}\n\n# Tarefa: NARRAR\nO jogador escreveu: """${req.playerText ?? "(abertura de cena)"}"""\nTipo de ação resolvida pelo motor: ${req.actionType ?? "?"}\nResultado geral dos testes: ${req.outcome.verdict ?? "none"}\nFATOS AUTORITATIVOS desta ação, em ordem (não contradiga, não acrescente mecânicas; [mechanic] e [progress] já aparecem na interface e não precisam ser lidos em voz alta; [dialogue:id] é a fala exata daquele NPC):\n${facts}\nResponda ao que o jogador tentou, sem repetir a ação dele nem o que já foi narrado. Falas de NPC vão em npcDialogue com npcId válido. "outcome" deve ser exatamente o resultado geral acima. Efeitos só da lista permitida.`,
          },
        ],
      },
      { signal },
    );
    if (response.stop_reason === "refusal") throw new Error("A IA recusou narrar esta cena.");
    return response.parsed_output;
  }
}
