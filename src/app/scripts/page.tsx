"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Play, RefreshCw, Loader2, X, CheckCircle, AlertCircle, FileCode, Info } from "lucide-react";

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

export default function ScriptsPage() {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningScript, setRunningScript] = useState<string | null>(null);
  const [result, setResult] = useState<{ script: string; result: ExecResult } | null>(null);

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
        <div>
          <h1 className="text-2xl font-bold">Scripts</h1>
          <p className="text-sm text-zinc-400">
            {scripts.length} shell scripts available
          </p>
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
          Scripts from <code className="text-zinc-400">workspace/scripts/</code>. 
          Click Run to execute. Description is extracted from comments at the top of each script.
        </span>
      </div>

      {/* Scripts Grid */}
      <section className="grid gap-3">
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
          scripts.map((script) => (
            <div
              key={script.name}
              className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 card-hover"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <FileCode className="w-4 h-4 text-orange-500 shrink-0" />
                    <h3 className="font-medium font-mono text-sm">
                      {script.name}
                    </h3>
                    {script.lineCount && (
                      <Badge variant="secondary" className="text-xs">
                        {script.lineCount} lines
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-zinc-400 mt-2 leading-relaxed break-words">
                    {script.description}
                  </p>
                  {script.modifiedAt && (
                    <div className="text-xs text-zinc-500 mt-2">
                      Modified {formatModifiedDate(script.modifiedAt)}
                    </div>
                  )}
                </div>
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
          ))
        )}
      </section>

      {/* Result Modal */}
      {result && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 w-full max-w-lg max-h-[80vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                {result.result.success ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-500" />
                )}
                <h3 className="font-medium font-mono text-sm">{result.script}</h3>
                <Badge variant={result.result.success ? "default" : "destructive"}>
                  {result.result.success ? "Success" : "Failed"}
                </Badge>
              </div>
              <button
                onClick={() => setResult(null)}
                className="p-1 rounded hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <ScrollArea className="flex-1 p-4">
              {result.result.error && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-red-400 mb-1">Error</h4>
                  <pre className="text-xs text-zinc-400 bg-zinc-950 rounded p-3 overflow-x-auto whitespace-pre-wrap break-words">
                    {result.result.error}
                  </pre>
                </div>
              )}
              {result.result.stdout && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-zinc-300 mb-1">Output</h4>
                  <pre className="text-xs text-zinc-400 bg-zinc-950 rounded p-3 overflow-x-auto whitespace-pre-wrap break-words">
                    {result.result.stdout}
                  </pre>
                </div>
              )}
              {result.result.stderr && (
                <div>
                  <h4 className="text-sm font-medium text-yellow-400 mb-1">Stderr</h4>
                  <pre className="text-xs text-zinc-400 bg-zinc-950 rounded p-3 overflow-x-auto whitespace-pre-wrap break-words">
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
