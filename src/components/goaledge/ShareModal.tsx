"use client";

import type { Tip } from "@/types/goaledge";
import { Share2, X, Link2, MessageCircle, ImageDown } from "lucide-react";
import { toast } from "@/lib/toast";

interface ShareModalProps {
  open: boolean;
  tip: Tip | null;
  onClose: () => void;
}

export function ShareModal({ open, tip, onClose }: ShareModalProps) {
  if (!open || !tip) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="auth-backdrop absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-slate-900 overflow-hidden animate-[slide-down-fade]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Share this tip</h3>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Preview */}
        <div className="mx-5 mt-5 rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">{tip.flag}</span>
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">{tip.homeTeam} vs {tip.awayTeam}</p>
              <p className="text-xs text-slate-400">{tip.league} · {tip.prediction}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
            <div className="text-center flex-1">
              <p className="text-xs text-slate-400">Prediction</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white">{tip.prediction}</p>
            </div>
            <div className="text-center flex-1">
              <p className="text-xs text-slate-400">Odds</p>
              <p className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">{tip.odds}</p>
            </div>
            <div className="text-center flex-1">
              <p className="text-xs text-slate-400">Confidence</p>
              <p className="text-sm font-extrabold text-slate-900 dark:text-white">{tip.confidence}%</p>
            </div>
          </div>
        </div>

        {/* Share options */}
        <div className="mx-5 mb-5 space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400 px-5">Share via</p>
          <div className="flex gap-2 px-5">
            <button
              onClick={() => {
                const text = `⚽ ${tip.league}\n${tip.homeTeam} vs ${tip.awayTeam}\nPrediction: ${tip.prediction}\nOdds: ${tip.odds}\nConfidence: ${tip.confidence}%\n\nvia GoalEdge`;
                navigator.clipboard.writeText(text).then(() => {
                  toast.success("Link copied! Share with friends");
                  onClose();
                });
              }}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-emerald-600"
            >
              <Link2 className="h-4 w-4 text-slate-400" />
              Copy Link
            </button>
          </div>
          <div className="flex gap-2 px-5 mt-2">
            <button
              onClick={() => {
                const text = `⚽ ${tip.homeTeam} vs ${tip.awayTeam} — ${tip.prediction} @ ${tip.odds} | GoalEdge Tips`;
                window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank", "noopener");
              }}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-sky-600"
            >
              <Share2 className="h-4 w-4 text-sky-500" />
              Twitter/X
            </button>
            <button
              onClick={() => {
                const text = `⚽ ${tip.homeTeam} vs ${tip.awayTeam} — ${tip.prediction} @ ${tip.odds} | GoalEdge Tips`;
                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
              }}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-700 transition hover:border-green-300 hover:bg-green-50 hover:text-green-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-green-600"
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-700 text-[9px] font-bold text-white">W</span>
              WhatsApp
            </button>
            <button
              onClick={() => {
                const text = `⚽ ${tip.homeTeam} vs ${tip.awayTeam} — ${tip.prediction} @ ${tip.odds} | GoalEdge Tips`;
                window.open(`https://t.me/share/url?url=GoalEdge&text=${encodeURIComponent(text)}`, "_blank", "noopener");
              }}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-blue-600"
            >
              <MessageCircle className="h-4 w-4 text-blue-500" />
              Telegram
            </button>
          </div>
          <div className="flex gap-2 px-5 mt-2">
            <button
              onClick={() => {
                const url = `https://www.facebook.com/sharer/sharer.php?quote=${encodeURIComponent(`⚽ ${tip.homeTeam} vs ${tip.awayTeam} — ${tip.prediction} @ ${tip.odds} | GoalEdge Tips`)}`;
                window.open(url, "_blank", "noopener");
              }}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-700 transition hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-blue-600"
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white">f</span>
              Facebook
            </button>
            <button
              onClick={() => {
                const canvas = document.createElement("canvas");
                canvas.width = 400;
                canvas.height = 500;
                const ctx = canvas.getContext("2d");
                if (!ctx) { toast.error("Canvas not supported"); return; }

                // Background
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, 400, 500);

                // Emerald gradient at top
                const grad = ctx.createLinearGradient(0, 0, 400, 140);
                grad.addColorStop(0, "#10b981");
                grad.addColorStop(1, "#0d9488");
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, 400, 140);

                // Logo text
                ctx.fillStyle = "#ffffff";
                ctx.font = "bold 22px system-ui, -apple-system, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText("⚽ GoalEdge", 200, 40);

                // League name and flag
                ctx.font = "13px system-ui, -apple-system, sans-serif";
                ctx.fillStyle = "rgba(255,255,255,0.85)";
                ctx.fillText(`${tip.flag}  ${tip.league}`, 200, 65);

                // HOME vs AWAY
                ctx.fillStyle = "#ffffff";
                ctx.font = "bold 20px system-ui, -apple-system, sans-serif";
                ctx.fillText(`${tip.homeTeam} vs ${tip.awayTeam}`, 200, 100);

                // Match time
                ctx.font = "12px system-ui, -apple-system, sans-serif";
                ctx.fillStyle = "rgba(255,255,255,0.7)";
                ctx.fillText(tip.matchTime, 200, 125);

                // Prediction box
                const boxY = 165;
                const boxH = 55;
                ctx.fillStyle = "#f0fdf4";
                ctx.beginPath();
                ctx.roundRect(30, boxY, 340, boxH, 12);
                ctx.fill();
                ctx.strokeStyle = "#a7f3d0";
                ctx.lineWidth = 1.5;
                ctx.stroke();

                ctx.fillStyle = "#065f46";
                ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText("PREDICTION", 200, boxY + 22);
                ctx.font = "bold 18px system-ui, -apple-system, sans-serif";
                ctx.fillStyle = "#059669";
                ctx.fillText(tip.prediction, 200, boxY + 43);

                // Odds and confidence row
                const rowY = 250;
                // Odds card
                ctx.fillStyle = "#f8fafc";
                ctx.beginPath();
                ctx.roundRect(30, rowY, 160, 60, 10);
                ctx.fill();
                ctx.strokeStyle = "#e2e8f0";
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.fillStyle = "#94a3b8";
                ctx.font = "bold 10px system-ui, -apple-system, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText("ODDS", 110, rowY + 22);
                ctx.fillStyle = "#0f172a";
                ctx.font = "bold 22px system-ui, -apple-system, sans-serif";
                ctx.fillText(tip.odds, 110, rowY + 48);

                // Confidence card
                ctx.fillStyle = "#f8fafc";
                ctx.beginPath();
                ctx.roundRect(210, rowY, 160, 60, 10);
                ctx.fill();
                ctx.strokeStyle = "#e2e8f0";
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.fillStyle = "#94a3b8";
                ctx.font = "bold 10px system-ui, -apple-system, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText("CONFIDENCE", 290, rowY + 22);
                ctx.fillStyle = "#0f172a";
                ctx.font = "bold 22px system-ui, -apple-system, sans-serif";
                ctx.fillText(`${tip.confidence}%`, 290, rowY + 48);

                // Tipster info
                ctx.fillStyle = "#cbd5e1";
                ctx.font = "12px system-ui, -apple-system, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(`By ${tip.tipster}  ·  AI-Powered`, 200, 345);

                // Confidence bar
                const barY = 370;
                ctx.fillStyle = "#e2e8f0";
                ctx.beginPath();
                ctx.roundRect(50, barY, 300, 8, 4);
                ctx.fill();
                const barGrad = ctx.createLinearGradient(50, 0, 350, 0);
                barGrad.addColorStop(0, "#10b981");
                barGrad.addColorStop(1, "#059669");
                ctx.fillStyle = barGrad;
                ctx.beginPath();
                ctx.roundRect(50, barY, 300 * (tip.confidence / 100), 8, 4);
                ctx.fill();

                // Watermark
                ctx.fillStyle = "#94a3b8";
                ctx.font = "11px system-ui, -apple-system, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText("via GoalEdge", 200, 430);

                // Download
                canvas.toBlob((blob) => {
                  if (!blob) { toast.error("Failed to generate image"); return; }
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "goaledge-tip.png";
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                  toast.success("Image saved!");
                }, "image/png");
              }}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-700 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-violet-600"
            >
              <ImageDown className="h-4 w-4 text-violet-500" />
              Share as Image
            </button>
          </div>

          {/* Share Stats & QR Code */}
          <div className="mx-5 mt-4 flex gap-3">
            <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-center dark:border-slate-700 dark:bg-slate-800/50">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Confidence</p>
              <p className="mt-1 text-lg font-extrabold text-emerald-600 dark:text-emerald-400">{tip.confidence}%</p>
            </div>
            <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-center dark:border-slate-700 dark:bg-slate-800/50">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">League Rank</p>
              <p className="mt-1 text-lg font-extrabold text-amber-600 dark:text-amber-400">#{Math.min(99, Math.max(1, Math.round(100 - tip.confidence)))}</p>
            </div>
            <div className="flex-1 flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
              <div className="flex flex-col items-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-200 dark:bg-slate-700">
                  <span className="text-[9px] font-bold text-slate-600 dark:text-slate-400">QR Code</span>
                </div>
                <p className="mt-1 text-[9px] text-slate-400">Scan to share</p>
              </div>
            </div>
          </div>
          <p className="px-5 mt-3 text-center text-[10px] text-slate-400">
            Powered by GoalEdge AI · {tip.confidence}% confidence
          </p>
        </div>
      </div>
    </div>
  );
}