"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X, Crown, Check, ShieldCheck, Loader2, Lock, LogIn } from "lucide-react";
import { toast } from "@/lib/toast";

type ProConfig =
  | { configured: false; price: string; currency: string; interval: string; error?: string }
  | {
      configured: true;
      env: "sandbox" | "live";
      clientId: string;
      sdkUrl: string;
      planId: string;
      price: string;
      currency: string;
      interval: string;
      signedIn: boolean;
    };

type PayPalButtons = {
  render: (el: HTMLElement) => Promise<void>;
  close: () => void;
};

type PayPalNamespace = {
  Buttons: (opts: {
    style?: Record<string, string>;
    createSubscription: (_data: unknown, actions: {
      subscription: { create: (args: { plan_id: string }) => Promise<string> };
    }) => Promise<string>;
    onApprove: (data: { subscriptionID?: string }) => void | Promise<void>;
    onError?: (err: unknown) => void;
    onCancel?: () => void;
  }) => PayPalButtons;
};

declare global {
  interface Window {
    paypal?: PayPalNamespace;
  }
}

const BENEFITS = [
  "Every Pro tip, incl. full prediction analysis",
  "Expert reasoning and confidence breakdowns",
  "Bookmaker comparisons with best-price highlights",
  "New tips every day, straight from the board",
] as const;

const SDK_SCRIPT_ID = "paypal-js-sdk";

function loadPayPalSdk(sdkUrl: string): Promise<PayPalNamespace> {
  return new Promise((resolve, reject) => {
    if (window.paypal?.Buttons) {
      resolve(window.paypal);
      return;
    }
    const existing = document.getElementById(SDK_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => (window.paypal ? resolve(window.paypal) : reject(new Error("PayPal SDK failed to load"))), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load the PayPal SDK")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = SDK_SCRIPT_ID;
    script.src = sdkUrl;
    script.async = true;
    script.onload = () => (window.paypal ? resolve(window.paypal) : reject(new Error("PayPal SDK failed to load")));
    script.onerror = () => reject(new Error("Could not load the PayPal SDK"));
    document.body.appendChild(script);
  });
}

export function ProUpgradeModal({
  open,
  isPro,
  onClose,
  onActivated,
}: {
  open: boolean;
  isPro: boolean;
  onClose: () => void;
  /** Called after PayPal confirms the subscription and the server activates it. */
  onActivated: () => void;
}) {
  const [config, setConfig] = useState<ProConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [sdkLoading, setSdkLoading] = useState(false);
  const [activating, setActivating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const buttonHost = useRef<HTMLDivElement | null>(null);
  const buttonsRef = useRef<PayPalButtons | null>(null);

  // Reset stale config between opens. Adjusting state during render is the
  // sanctioned pattern for this (setState in an effect body is not).
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setConfig(null);
      setConfigError(null);
    }
  }

  // Load config + render the PayPal button when the modal opens for a
  // signed-in, non-Pro viewer.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/paypal/config", { cache: "no-store" });
        const data = (await res.json()) as ProConfig;
        if (cancelled) return;
        if (!res.ok && "error" in data && data.error) {
          setConfigError(data.error);
          setConfig({ configured: false, price: "0.99", currency: "USD", interval: "MONTH" });
          return;
        }
        setConfig(data);
      } catch {
        if (!cancelled) {
          setConfigError("Could not reach the payment service. Check your connection and try again.");
          setConfig({ configured: false, price: "0.99", currency: "USD", interval: "MONTH" });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  // Render the PayPal button once we know the config and the host div exists.
  useEffect(() => {
    if (!open || !config || !config.configured || isPro || !config.signedIn) return;
    if (!buttonHost.current) return;
    const host = buttonHost.current;
    let cancelled = false;
    setSdkLoading(true);

    (async () => {
      try {
        const paypal = await loadPayPalSdk(config.sdkUrl);
        if (cancelled || !host) return;
        host.innerHTML = "";
        const buttons = paypal.Buttons({
          style: { layout: "vertical", color: "gold", shape: "pill", label: "subscribe", height: "48" },
          createSubscription: (_data, actions) =>
            actions.subscription.create({ plan_id: config.planId }),
          onApprove: async (data) => {
            const subscriptionId = data.subscriptionID;
            if (!subscriptionId) {
              toast.error("PayPal did not return a subscription id");
              return;
            }
            setActivating(true);
            try {
              const res = await fetch("/api/paypal/activate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subscriptionId }),
              });
              const result = (await res.json()) as { ok?: boolean; error?: string };
              if (!res.ok || !result.ok) {
                throw new Error(result.error ?? "Activation failed");
              }
              toast.success("Welcome to Hyper Pro! 🎉");
              onActivated();
              onClose();
            } catch (error) {
              toast.error((error as Error)?.message ?? "Payment approved but activation failed — contact support.");
            } finally {
              setActivating(false);
            }
          },
          onError: (err) => {
            console.error("[paypal] button error:", err);
            toast.error("PayPal hit a problem. Please try again.");
          },
        });
        buttonsRef.current = buttons;
        await buttons.render(host);
      } catch (error) {
        if (!cancelled) {
          setConfigError((error as Error)?.message ?? "Could not load PayPal.");
        }
      } finally {
        if (!cancelled) setSdkLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (host) host.innerHTML = "";
      buttonsRef.current = null;
    };
  }, [open, config, isPro, onActivated, onClose]);

  const handleCancel = useCallback(async () => {
    if (!window.confirm("Cancel Hyper Pro? You keep access until the end of the period you already paid for.")) return;
    setCancelling(true);
    try {
      const res = await fetch("/api/paypal/cancel", { method: "POST" });
      const result = (await res.json()) as { ok?: boolean; accessUntil?: string | null; error?: string };
      if (!res.ok || !result.ok) throw new Error(result.error ?? "Cancellation failed");
      const until = result.accessUntil ? new Date(result.accessUntil).toLocaleDateString() : null;
      toast.success(until ? `Pro cancelled. Access until ${until}.` : "Pro cancelled.");
      onClose();
    } catch (error) {
      toast.error((error as Error)?.message ?? "Could not cancel — please try again.");
    } finally {
      setCancelling(false);
    }
  }, [onClose]);

  if (!open) return null;

  const priceLabel = config ? `$${config.price}` : "$0.99";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-2xl">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 text-white transition hover:bg-white/30"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 px-6 py-6 text-white">
          <div className="flex items-center gap-2 text-amber-100">
            <Crown className="h-5 w-5" />
            <p className="text-xs font-bold uppercase tracking-widest">Hyper Pro</p>
          </div>
          <h3 className="mt-2 text-2xl font-extrabold leading-tight">Unlock every pro tip</h3>
          <p className="mt-1 text-sm text-amber-100">
            <span className="text-2xl font-black text-white">{priceLabel}</span>
            <span className="text-amber-100"> USD / month · cancel anytime</span>
          </p>
        </div>

        <div className="p-6">
          {isPro ? (
            /* ── Already a Pro member ─────────────────────────────── */
            <div className="flex flex-col items-center py-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/30">
                <Check className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h4 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">You&apos;re a Pro member</h4>
              <p className="mt-1 max-w-xs text-sm text-slate-500 dark:text-slate-400">
                Every Pro tip and analysis on the board is unlocked for you.
              </p>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="mt-5 text-xs font-medium text-slate-400 underline-offset-2 transition hover:text-red-500 hover:underline disabled:opacity-50"
              >
                {cancelling ? "Cancelling…" : "Cancel subscription"}
              </button>
            </div>
          ) : (
            <>
              {/* Benefits */}
              <ul className="space-y-2.5">
                {BENEFITS.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-2.5 text-sm text-slate-600 dark:text-slate-300">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>

              <div className="my-5 h-px bg-slate-100 dark:bg-slate-800" />

              {/* Payment area */}
              {!config && !configError && (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking payment setup…
                </div>
              )}

              {config && !config.configured && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center dark:border-amber-900/50 dark:bg-amber-950/30">
                  <Lock className="mx-auto h-6 w-6 text-amber-500" />
                  <p className="mt-2 text-sm font-bold text-amber-800 dark:text-amber-300">
                    Payments aren&apos;t switched on yet
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                    {configError ?? "The site owner needs to set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET (and NEXT_PUBLIC_PAYPAL_CLIENT_ID) in the environment, then redeploy. See PAYPAL_PAYMENTS.md."}
                  </p>
                </div>
              )}

              {config && config.configured && !config.signedIn && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center dark:border-slate-700 dark:bg-slate-800">
                  <LogIn className="mx-auto h-6 w-6 text-slate-400" />
                  <p className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-200">Sign in required</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Your Pro membership is tied to your Hyper account. Please{" "}
                    <a href="/login" className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">sign in</a>{" "}
                    first, then come back to subscribe.
                  </p>
                </div>
              )}

              {config && config.configured && config.signedIn && (
                <div>
                  {configError && (
                    <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
                      {configError}
                    </p>
                  )}
                  {sdkLoading && (
                    <div className="flex items-center justify-center gap-2 py-3 text-sm text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading PayPal…
                    </div>
                  )}
                  {activating && (
                    <div className="flex items-center justify-center gap-2 py-3 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      <Loader2 className="h-4 w-4 animate-spin" /> Activating your Pro membership…
                    </div>
                  )}
                  <div ref={buttonHost} className="paypal-button-host min-h-[3rem]" />
                  {config.env === "sandbox" && (
                    <p className="mt-2 text-center text-[10px] uppercase tracking-wide text-slate-400">
                      Sandbox mode — use a PayPal test account
                    </p>
                  )}
                </div>
              )}

              <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-400 dark:text-slate-500">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                Secure payment by PayPal · renews monthly · cancel anytime
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
