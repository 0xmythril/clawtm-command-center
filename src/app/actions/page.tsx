"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Play, RefreshCw, Loader2, X, CheckCircle, AlertCircle, FileCode, Info, Star, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocalStorage } from "@/lib/use-local-storage";

interface Script {
  name: string;
  description: string;
  lineCount?: number;
  sizeKb?: number;
  modifiedAt?: string;
}

interface ExecResult {
  success: boolean;
  stdout: string;
  stderr: string;
  error?: string;
}

export default function ActionsPage() {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningScript, setRunningScript] = useState<string | null>(null);
  const [result, setResult] = useState<{ script: string; result: ExecResult } | null>(null);
  const [favorites, setFavorites] = useLocalStorage<string[]>("pinned-scripts", []);

  const fetchScripts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/scripts");
      const data = await res.json();
      setScripts(data.scripts || []);
    } catch {
      setScripts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScripts();
  }, []);

  const runScript = async (scriptName: string, args?: string[]) => {
    setRunningScript(scriptName);
    setResult(null);
    try {
      const res = await fetch("/api/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: scriptName, args }),
      });
      const data: ExecResult = await res.json();
      setResult({ script: scriptName, result: data });
    } catch (err) {
      setResult({
        script: scriptName,
        result: {
          success: false,
          stdout: "",
          stderr: "",
          error: String(err),
        },
      });
    } finally {
      setRunningScript(null);
    }
  };

  const toggleFavorite = (scriptName: string) => {
    setFavorites((prev) => {
      if (prev.includes(scriptName)) {
        return prev.filter((s) => s !== scriptName);
      }
      // Max 4 favorites
      if (prev.length >= 4) {
        return [...prev.slice(1), scriptName];
      }
      return [...prev, scriptName];
    });
  };

  const formatModifiedDate = (dateStr?: string): string => {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) return "Today";
      if (diffDays === 1) return "Yesterday";
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="w-6 h-6 text-orange-500" />
          <div>
            <h1 className="text-2xl font-bold">Actions</h1>
            <p className="text-sm text-zinc-400">
              {scripts.length} scripts · {favorites.length}/4 pinned
            </p>
          </div>
        </div>
        <button
          onClick={fetchScripts}
          disabled={loading}
          className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors btn-press disabled:opacity-50"
        >
          <RefreshCw
            className={`w-5 h-5 ${loading ? "animate-spin" : ""}`}
            strokeWidth={1.5}
          />
        </button>
      </header>

      {/* Info Banner */}
      <div className="flex items-start gap-2 text-xs text-zinc-500 bg-zinc-900/50 rounded-lg p-3 border border-zinc-800/50">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          Tap the <Star className="w-3 h-3 inline text-orange-400" /> to pin scripts to your Dashboard for quick access.
          Max 4 pinned actions.
        </span>
      </div>

      {/* Scripts Grid */}
      <section className="space-y-3">
        {loading ? (
          <>
            <Skeleton className="h-24 skeleton-shimmer rounded-xl" />
            <Skeleton className="h-24 skeleton-shimmer rounded-xl" />
            <Skeleton className="h-24 skeleton-shimmer rounded-xl" />
          </>
        ) : scripts.length === 0 ? (
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 text-center">
            <FileCode className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-400">No scripts found</p>
            <p className="text-xs text-zinc-500 mt-1">Add .sh files to workspace/scripts/</p>
          </div>
        ) : (
          scripts.map((script) => {
            const isPinned = favorites.includes(script.name);
            
            return (
              <div
                key={script.name}
                className={cn(
                  "bg-zinc-900 rounded-xl border p-4 card-hover overflow-hidden",
                  isPinned ? "border-orange-500/30" : "border-zinc-800"
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Pin button */}
                  <button
                    onClick={() => toggleFavorite(script.name)}
                    className={cn(
                      "p-2 rounded-lg transition-colors shrink-0",
                      isPinned 
                        ? "bg-orange-500/20 text-orange-400" 
                        : "bg-zinc-800 text-zinc-500 hover:text-orange-400"
                    )}
                  >
                    <Star className={cn("w-4 h-4", isPinned && "fill-current")} />
                  </button>
                  
                  {/* Script info */}
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="flex items-center gap-2 flex-wrap">
                      <FileCode className="w-4 h-4 text-orange-500 shrink-0" />
                      <h3 className="font-medium font-mono text-sm truncate">
                        {script.name}
                      </h3>
                      {script.lineCount && (
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {script.lineCount} lines
                        </Badge>
                      )}
                      {isPinned && (
                        <Badge className="text-xs bg-orange-500/20 text-orange-400 border-0 shrink-0">
                          Pinned
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-zinc-400 mt-2 leading-relaxed break-words line-clamp-3">
                      {script.description}
                    </p>
                    {script.modifiedAt && (
                      <div className="text-xs text-zinc-500 mt-2">
                        Modified {formatModifiedDate(script.modifiedAt)}
                      </div>
                    )}
                  </div>
                  
                  {/* Run button */}
                  <Button
                    size="sm"
                    onClick={() => runScript(script.name)}
                    disabled={runningScript === script.name}
                    className="h-9 px-4 bg-orange-500 hover:bg-orange-600 text-white shrink-0"
                  >
                    {runningScript === script.name ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-1" />
                        Run
                      </>
                    )}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* Result Modal */}
      {result && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 w-full max-w-lg max-h-[80vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <div className="flex items-center gap-2 min-w-0">
                {result.result.success ? (
                  <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                )}
                <h3 className="font-medium font-mono text-sm truncate">{result.script}</h3>
                <Badge variant={result.result.success ? "default" : "destructive"} className="shrink-0">
                  {result.result.success ? "Success" : "Failed"}
                </Badge>
              </div>
              <button
                onClick={() => setResult(null)}
                className="p-1 rounded hover:bg-zinc-800 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <ScrollArea className="flex-1 p-4">
              {result.result.error && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-red-400 mb-1">Error</h4>
                  <pre className="text-xs text-zinc-400 bg-zinc-950 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">
                    {result.result.error}
                  </pre>
                </div>
              )}
              {result.result.stdout && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-zinc-300 mb-1">Output</h4>
                  <pre className="text-xs text-zinc-400 bg-zinc-950 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">
                    {result.result.stdout}
                  </pre>
                </div>
              )}
              {result.result.stderr && (
                <div>
                  <h4 className="text-sm font-medium text-yellow-400 mb-1">Stderr</h4>
                  <pre className="text-xs text-zinc-400 bg-zinc-950 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">
                    {result.result.stderr}
                  </pre>
                </div>
              )}
              {!result.result.stdout && !result.result.stderr && !result.result.error && (
                <p className="text-zinc-400 text-sm">No output</p>
              )}
            </ScrollArea>

            {/* Modal Footer */}
            <div className="p-4 border-t border-zinc-800">
              <Button
                onClick={() => setResult(null)}
                variant="outline"
                className="w-full"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
