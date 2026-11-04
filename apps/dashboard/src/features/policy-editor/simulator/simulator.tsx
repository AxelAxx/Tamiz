"use client";

/**
 * The policy simulator (design `simulator.html`; spec 008 US3, research R-06). Paste a text,
 * simulate it, and watch the decision unfold step by step; no model is called. The text
 * lives in React state only: never in the address bar, browser storage or logs (US3-6).
 */
import { zodResolver } from "@hookform/resolvers/zod";
import type { ChatMessage, SimulateResponse } from "@tamiz/contracts";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Ban,
  CircleCheck,
  CircleX,
  FlaskConical,
  House,
  LoaderCircle,
  LockKeyhole,
  type LucideIcon,
  Pencil,
  Play,
  Plus,
  ScanSearch,
  TriangleAlert,
  VenetianMask,
} from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BADGE, TONE, type Tone } from "@/features/shared/badges";
import { CARD } from "@/features/shared/card";
import { RegionError } from "@/features/shared/region-states";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { DECIDING_STEP, DecisionFlow } from "./decision-flow";
import { HighlightedMessages, ProviderMessages } from "./highlighted-text";
import { EMPTY_FORM, SAMPLES, type SimulatorForm, SimulatorFormSchema, toRequest } from "./schema";

/** Delay between two decision steps (`--duration-step`). */
const STEP_MS = 380;

function Verdict({ response }: { readonly response: SimulateResponse }) {
  const look: { tone: Tone; icon: LucideIcon; label: string } =
    response.decision === "block"
      ? { tone: "danger", icon: Ban, label: "Blocked" }
      : response.privacyAction === "restrict_to_local"
        ? { tone: "local", icon: House, label: "Routed local" }
        : response.privacyAction === "anonymize"
          ? { tone: "info", icon: VenetianMask, label: "Anonymized, then routed" }
          : { tone: "neutral", icon: ArrowUpRight, label: "Allowed" };
  const Icon = look.icon;
  return (
    <span data-slot="badge" data-component="verdict" className={cn(BADGE, TONE[look.tone])}>
      <Icon aria-hidden="true" className="size-3.5" />
      {look.label}
    </span>
  );
}

function FieldError({
  id,
  message,
}: {
  readonly id: string;
  readonly message: string | undefined;
}) {
  if (message === undefined) return null;
  return (
    <p id={id} className="flex items-center gap-1.5 text-sm text-danger">
      <CircleX aria-hidden="true" className="size-3.5" />
      {message}
    </p>
  );
}

const invalid = "border-danger ring-[3px] ring-danger/20";

export function Simulator() {
  const form = useForm<SimulatorForm>({
    resolver: zodResolver(SimulatorFormSchema),
    defaultValues: EMPTY_FORM,
  });
  const messages = useFieldArray({ control: form.control, name: "messages" });
  const [showSystem, setShowSystem] = useState(false);
  const [editing, setEditing] = useState(true);
  const [submitted, setSubmitted] = useState<ReadonlyArray<ChatMessage>>([]);
  const [model, setModel] = useState("");
  const [revealed, setRevealed] = useState(0);

  const simulation = useMutation({ mutationFn: api.simulate });
  const response = simulation.data;

  // Reveal the steps one by one; a block stops at its deciding step.
  useEffect(() => {
    if (response === undefined) return;
    const last = response.blockReason === undefined ? 5 : DECIDING_STEP[response.blockReason];
    setRevealed(0);
    let step = 0;
    const timer = setInterval(() => {
      step += 1;
      setRevealed(step);
      if (step >= last) clearInterval(timer);
    }, STEP_MS);
    return () => clearInterval(timer);
  }, [response]);

  const onSubmit = form.handleSubmit((values) => {
    const request = toRequest(values);
    setSubmitted(request.messages);
    setModel(request.model);
    setEditing(false);
    setRevealed(0);
    simulation.mutate(request, { onError: () => setEditing(true) });
  });

  const submitOnShortcut = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void onSubmit();
    }
  };

  const edit = () => {
    setEditing(true);
    // After the form is back in the tree.
    setTimeout(() => form.setFocus("messages.0.content"), 0);
  };

  const errors = form.formState.errors;
  const firstText = form.watch("messages.0.content");
  const running = simulation.isPending;
  const failed = simulation.isError;
  const lastStep =
    response === undefined
      ? 5
      : response.blockReason === undefined
        ? 5
        : DECIDING_STEP[response.blockReason];
  const finished = response !== undefined && revealed >= lastStep;
  const inspected = response !== undefined && revealed >= 1;

  const finding = !inspected
    ? { icon: LoaderCircle, tone: "text-muted-foreground", text: "Inspecting…", spin: true }
    : response.detector !== "ok"
      ? {
          icon: TriangleAlert,
          tone: "text-danger",
          text: "Inspection failed: no highlights available",
        }
      : response.entities.length === 0
        ? { icon: CircleCheck, tone: "text-success", text: "No personal data detected" }
        : {
            icon: ScanSearch,
            tone: "text-foreground",
            text: `${response.entities.length} ${response.entities.length === 1 ? "entity" : "entities"} detected`,
          };
  const FindingIcon = finding.icon;

  const formView = (
    <form className="flex flex-col gap-4 p-4" onSubmit={onSubmit} noValidate>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-medium text-muted-foreground">Samples</legend>
        <div className="flex flex-wrap gap-1.5">
          {SAMPLES.map((sample) => {
            const on = firstText === sample.text;
            return (
              <button
                key={sample.label}
                type="button"
                data-slot="toggle"
                aria-pressed={on}
                className={cn(
                  "inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium",
                  on
                    ? "border-foreground/40 bg-accent text-foreground"
                    : "border-input bg-surface text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
                onClick={() =>
                  form.setValue("messages.0.content", sample.text, { shouldValidate: false })
                }
              >
                {sample.label}
              </button>
            );
          })}
        </div>
      </fieldset>
      {showSystem ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="sim-system">
            System message <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="sim-system"
            rows={2}
            className="resize-y bg-surface"
            placeholder="Instructions for the model"
            onKeyDown={submitOnShortcut}
            {...form.register("system")}
          />
        </div>
      ) : null}
      {messages.fields.map((field, index) => {
        const id = index === 0 ? "sim-user" : `sim-user-${index + 1}`;
        const error = errors.messages?.[index]?.content?.message;
        return (
          <div key={field.id} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor={id}>
                {index === 0 ? "User message" : `User message ${index + 1}`}
              </Label>
              {index === 0 ? (
                <span className="hidden text-xs text-muted-foreground md:inline">
                  <kbd className="rounded-sm border bg-muted px-1 font-mono">Ctrl</kbd> +{" "}
                  <kbd className="rounded-sm border bg-muted px-1 font-mono">Enter</kbd> to simulate
                </span>
              ) : null}
            </div>
            <Textarea
              id={id}
              rows={index === 0 ? 5 : 2}
              className={cn(
                "resize-y bg-surface leading-relaxed md:text-base",
                error !== undefined && invalid,
              )}
              aria-invalid={error !== undefined}
              {...(error !== undefined && { "aria-describedby": `${id}-err` })}
              onKeyDown={submitOnShortcut}
              {...form.register(`messages.${index}.content`)}
            />
            <FieldError id={`${id}-err`} message={error} />
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        {showSystem ? null : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setShowSystem(true)}
          >
            <Plus aria-hidden="true" />
            Add system message
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => messages.append({ content: "" })}
        >
          <Plus aria-hidden="true" />
          Add message
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sim-model">Requested model</Label>
        <Input
          id="sim-model"
          className={cn("bg-surface font-mono", errors.model !== undefined && invalid)}
          aria-invalid={errors.model !== undefined}
          {...(errors.model !== undefined && { "aria-describedby": "sim-model-err" })}
          {...form.register("model")}
        />
        <FieldError id="sim-model-err" message={errors.model?.message} />
      </div>
      <div className="flex flex-col-reverse gap-3 border-t pt-4 md:flex-row md:items-center md:justify-between">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <LockKeyhole aria-hidden="true" className="size-3.5" />
          This text stays in your browser tab; it is not stored.
        </p>
        <Button type="submit" disabled={running} className="max-md:h-10">
          <Play aria-hidden="true" />
          Simulate
        </Button>
      </div>
    </form>
  );

  const submittedView = (
    <div className="flex flex-col gap-3 p-4">
      <p className={cn("flex items-center gap-1.5 text-sm font-medium", finding.tone)}>
        <FindingIcon
          aria-hidden="true"
          className={cn("size-4", finding.spin === true && "animate-spin")}
        />
        {finding.text}
      </p>
      <HighlightedMessages
        messages={submitted}
        response={response}
        reveal={inspected && response?.detector === "ok"}
      />
      <p className="text-xs text-muted-foreground">
        Requested model <span className="font-mono text-foreground">{model}</span>
      </p>
    </div>
  );

  const showForm = editing || failed;
  let decision: ReactNode;
  if (failed) {
    decision = <RegionError error={simulation.error} onRetry={() => void onSubmit()} />;
  } else if (!running && response === undefined) {
    decision = (
      <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
          <FlaskConical aria-hidden="true" className="size-5" />
        </span>
        <h3 className="text-base font-semibold">See what the gateway would do</h3>
        <p className="max-w-sm text-sm text-muted-foreground">
          Paste a text or pick a sample, then simulate. Tamiz inspects it, classifies it, picks a
          rule, a privacy action and a route. No model is called.
        </p>
      </div>
    );
  } else {
    decision = <DecisionFlow response={running ? undefined : response} revealed={revealed} />;
  }

  return (
    <div className="mx-auto grid w-full max-w-screen-2xl grid-cols-1 items-start gap-4 p-4 md:p-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] xl:gap-6">
      <div className="flex min-w-0 flex-col gap-4">
        <section aria-labelledby="sim-input-h" data-slot="card" className={CARD}>
          <div className="flex h-12 items-center justify-between gap-2 border-b px-4">
            <h2 id="sim-input-h" className="text-sm font-semibold">
              {showForm ? "Input" : "Submitted text"}
            </h2>
            {showForm ? null : (
              <Button variant="outline" size="sm" onClick={edit}>
                <Pencil aria-hidden="true" />
                Edit
              </Button>
            )}
          </div>
          {showForm ? formView : submittedView}
        </section>
        {!showForm &&
        response?.providerMessages !== undefined &&
        response.privacyAction === "anonymize" &&
        revealed >= 4 ? (
          <section
            aria-labelledby="sim-provider-h"
            data-slot="card"
            className={cn(CARD, "animate-fade-in")}
          >
            <div className="flex h-12 items-center justify-between gap-2 border-b px-4">
              <h2 id="sim-provider-h" className="text-sm font-semibold">
                Provider receives
              </h2>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <VenetianMask aria-hidden="true" className="size-3.5" />
                Anonymized
              </span>
            </div>
            <ProviderMessages response={response} />
          </section>
        ) : null}
      </div>
      <section aria-labelledby="sim-decision-h" data-slot="card" className={cn(CARD, "min-w-0")}>
        <div className="flex h-12 items-center justify-between gap-2 border-b px-4">
          <h2 id="sim-decision-h" className="text-sm font-semibold">
            Decision
          </h2>
          {finished && !running ? <Verdict response={response} /> : null}
          {running ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
              Simulating…
            </span>
          ) : null}
        </div>
        {decision}
      </section>
    </div>
  );
}
