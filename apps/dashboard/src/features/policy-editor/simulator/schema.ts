/**
 * The simulator form (spec 008 US3-4, research R-06): an optional system message, one or
 * more user messages and the requested model. It becomes a chat completion request that
 * must satisfy the contract and fit the gateway's body limit (`MAX_BODY_BYTES`); every
 * failure is reported next to its field and nothing is sent.
 */
import {
  type ChatCompletionRequest,
  ChatCompletionRequestSchema,
  MAX_BODY_BYTES,
} from "@tamiz/contracts";
import { z } from "zod";

export const DEFAULT_MODEL = "tamiz-auto";

const NEED_TEXT = "Enter a message to simulate.";

export const SimulatorFormSchema = z
  .object({
    system: z.string(),
    messages: z
      .array(z.object({ content: z.string().refine((t) => t.trim() !== "", NEED_TEXT) }))
      .min(1),
    model: z.string().refine((m) => m.trim() !== "", "Enter a model name, for example tamiz-auto."),
  })
  .superRefine((form, context) => {
    const request = toRequest(form);
    if (!ChatCompletionRequestSchema.safeParse(request).success) return;
    const bytes = new TextEncoder().encode(JSON.stringify(request)).length;
    if (bytes > MAX_BODY_BYTES) {
      context.addIssue({
        code: "custom",
        path: ["messages", 0, "content"],
        message: `Too long: the gateway reads at most ${MAX_BODY_BYTES.toLocaleString("en-US")} bytes (this is ${bytes.toLocaleString("en-US")}).`,
      });
    }
  });

export type SimulatorForm = z.infer<typeof SimulatorFormSchema>;

/** The request the gateway simulates; an empty system message is left out. */
export function toRequest(form: SimulatorForm): ChatCompletionRequest {
  const system =
    form.system.trim() === "" ? [] : [{ role: "system" as const, content: form.system }];
  return {
    model: form.model.trim(),
    messages: [
      ...system,
      ...form.messages.map((m) => ({ role: "user" as const, content: m.content })),
    ],
  };
}

export const EMPTY_FORM: SimulatorForm = {
  system: "",
  messages: [{ content: "" }],
  model: DEFAULT_MODEL,
};

/** One-click sample texts (design `simulator.html`). Synthetic data only. */
export const SAMPLES: ReadonlyArray<{ readonly label: string; readonly text: string }> = [
  { label: "With a DNI", text: "Resume el expediente de 12345678Z para el comité." },
  {
    label: "Name and email",
    text: "Resume el informe de Lucía Pérez (lucia.perez@example.com) para el comité.",
  },
  {
    label: "No personal data",
    text: "Pedido 12345678 enviado el 03/11/2026 al código postal 46001.",
  },
  {
    label: "Code request",
    text: "Escribe una función en TypeScript que valide la letra de control de un DNI.",
  },
];
