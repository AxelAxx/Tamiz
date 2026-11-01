/**
 * The submitted messages with each detected entity marked in place (`design/components.md`
 * "Highlighted text"; spec 008 US3-1, US3-5), and the messages a provider would receive
 * with their placeholders marked (US3-2). The text is read-only and never changed.
 */
import type { ChatMessage, SimulateResponse } from "@tamiz/contracts";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { CRITICAL_KINDS, ENTITY_NAMES } from "@/features/shared/privacy";
import { cn } from "@/lib/utils";
import { highlightSegments, placeholderSegments, type SpanInput } from "./highlight";

function contentOf(message: ChatMessage): string | undefined {
  return typeof message.content === "string" ? message.content : undefined;
}

/** The spans found in message `index`'s content. */
function spansFor(response: SimulateResponse, index: number): SpanInput[] {
  return response.entities.filter((e) =>
    e.location === undefined
      ? e.messageIndex === index
      : e.location.kind === "content" && e.location.messageIndex === index,
  );
}

function describe(entity: SpanInput): string {
  const critical = CRITICAL_KINDS.has(entity.kind) ? ", critical" : "";
  return `${ENTITY_NAMES[entity.kind]}${critical}, score ${entity.score.toFixed(2)}`;
}

function Marked({
  text,
  entities,
}: {
  readonly text: string;
  readonly entities: ReadonlyArray<SpanInput>;
}) {
  const critical = entities.some((e) => CRITICAL_KINDS.has(e.kind));
  const kinds = [...new Set(entities.map((e) => e.kind))];
  return (
    <mark
      data-component="entity-highlight"
      data-kind={kinds.join(" ")}
      title={entities.map(describe).join("; ")}
      className={cn(
        "animate-fade-in rounded-sm px-1 py-0.5 text-foreground ring-1",
        critical ? "bg-danger-soft ring-danger/40" : "bg-info-soft ring-info/40",
      )}
    >
      {text}
      {kinds.map((kind) => (
        <span
          key={kind}
          aria-hidden="true"
          className={cn(
            "ml-1 rounded-xs px-1 py-px align-[1px] font-mono text-xs font-medium text-surface",
            CRITICAL_KINDS.has(kind) ? "bg-danger" : "bg-info",
          )}
        >
          {kind}
        </span>
      ))}
      <span className="sr-only">, {entities.map(describe).join("; ")}</span>
    </mark>
  );
}

function MessageBlock({ role, children }: { readonly role: string; readonly children: ReactNode }) {
  return (
    <div
      data-component="highlighted-text"
      className="flex flex-col gap-1.5 rounded-md border bg-background px-3 py-2.5"
    >
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {role}
      </span>
      <p className="text-base leading-8 break-words whitespace-pre-wrap">{children}</p>
    </div>
  );
}

/** The submitted messages; highlights appear once the inspection step resolves. */
export function HighlightedMessages({
  messages,
  response,
  reveal,
}: {
  readonly messages: ReadonlyArray<ChatMessage>;
  readonly response: SimulateResponse | undefined;
  readonly reveal: boolean;
}) {
  return (
    <>
      {messages.map((message, index) => {
        const text = contentOf(message) ?? "";
        const spans = reveal && response !== undefined ? spansFor(response, index) : [];
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: messages are fixed for one result
          <MessageBlock key={index} role={message.role}>
            {highlightSegments(text, spans).map((segment, i) =>
              segment.entities === undefined ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional
                <span key={i}>{segment.text}</span>
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional
                <Marked key={i} text={segment.text} entities={segment.entities} />
              ),
            )}
          </MessageBlock>
        );
      })}
    </>
  );
}

/** What an anonymizing route sends: the notice collapsed, placeholders marked. */
export function ProviderMessages({ response }: { readonly response: SimulateResponse }) {
  const messages = response.providerMessages ?? [];
  return (
    <div className="flex flex-col gap-2 p-4">
      {messages.map((message, index) => {
        const text = contentOf(message) ?? "";
        if (message.role === "system") {
          return (
            <details
              // biome-ignore lint/suspicious/noArrayIndexKey: messages are fixed for one result
              key={index}
              data-slot="collapsible"
              className="group rounded-md border bg-background px-3 py-2"
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm">
                <ChevronRight
                  aria-hidden="true"
                  className="size-3.5 text-muted-foreground transition-transform group-open:rotate-90"
                />
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  System
                </span>
                <span className="truncate">
                  Anonymization notice{" "}
                  {response.notice === undefined ? null : (
                    <span className="font-mono">{response.notice}</span>
                  )}
                </span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {text}
              </p>
            </details>
          );
        }
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: messages are fixed for one result
          <MessageBlock key={index} role={message.role}>
            {placeholderSegments(text).map((part, i) =>
              part.placeholder ? (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional
                  key={i}
                  className="rounded-sm bg-info-soft px-1 py-0.5 font-mono text-sm font-medium text-info ring-1 ring-info/30"
                >
                  {part.text}
                </span>
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional
                <span key={i}>{part.text}</span>
              ),
            )}
          </MessageBlock>
        );
      })}
    </div>
  );
}
