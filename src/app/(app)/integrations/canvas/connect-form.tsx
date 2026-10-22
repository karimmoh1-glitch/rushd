"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { connectCanvas } from "@/server/actions/canvas";

const STEPS = [
  {
    title: "Open your school's Canvas",
    body: "Log in the way you normally do. The address in your browser bar (for example yourschool.instructure.com or canvas.yourschool.edu) is what Rushd needs.",
  },
  {
    title: "Create an access token",
    body: "Go to Account, then Settings. Under Approved Integrations, choose New Access Token. Name it Rushd and generate it.",
  },
  {
    title: "Copy it right away",
    body: "Canvas shows the token only once. Paste it below. If you don't see New Access Token, your school has turned personal tokens off, and Rushd still works without Canvas.",
  },
];

export function ConnectForm({
  initialBaseUrl = "",
  reconnect = false,
}: {
  initialBaseUrl?: string;
  reconnect?: boolean;
}) {
  const router = useRouter();
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await connectCanvas({ baseUrl, token });
      // The token never lingers in client state once it has been sent.
      setToken("");
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success(`Connected as ${result.data.canvasUserName}. Found ${result.data.courseCount} course${result.data.courseCount === 1 ? "" : "s"}.`);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
      {!reconnect && (
        <ol className="space-y-5">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border font-mono text-xs tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <div>
                <p className="font-medium">{step.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      )}

      <form onSubmit={handleSubmit} className="surface space-y-5 rounded-xl p-5 sm:p-6" noValidate>
        <div className="space-y-2">
          <Label htmlFor="canvas-base-url">Canvas address</Label>
          <Input
            id="canvas-base-url"
            name="canvas-base-url"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            placeholder="yourschool.instructure.com"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            aria-describedby="canvas-base-url-help"
            aria-invalid={error ? true : undefined}
            required
          />
          <p id="canvas-base-url-help" className="text-xs text-muted-foreground">
            Every school has its own Canvas address. Paste any Canvas page link and Rushd keeps just the address.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="canvas-token">Access token</Label>
          <div className="relative">
            <Input
              id="canvas-token"
              name="canvas-token"
              type={showToken ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="pr-10 font-mono"
              aria-invalid={error ? true : undefined}
              required
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label={showToken ? "Hide token" : "Show token"}
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" size="lg" disabled={pending || !baseUrl.trim() || !token.trim()}>
          {pending ? "Checking with Canvas..." : reconnect ? "Reconnect" : "Connect Canvas"}
        </Button>

        <p className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Rushd checks the token with Canvas, then stores it encrypted (AES-256-GCM). It&apos;s only used by
          Rushd&apos;s server to read your courses and assignments, and it&apos;s never shown again, not even to you.
        </p>
      </form>
    </div>
  );
}
