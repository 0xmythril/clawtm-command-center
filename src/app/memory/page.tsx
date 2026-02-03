"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Calendar, Brain, FileText, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface MemoryFile {
  name: string;
  date: string;
}

export default function MemoryPage() {
  const [memoryFiles, setMemoryFiles] = useState<MemoryFile[]>([]);
  const [intelligenceFiles, setIntelligenceFiles] = useState<MemoryFile[]>([]);
  const [longTermMemory, setLongTermMemory] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<"memory" | "intelligence">("memory");
  const [fileContent, setFileContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const [memoryRes, intelligenceRes, longTermRes] = await Promise.all([
        fetch("/api/memory?type=memory"),
        fetch("/api/memory?type=intelligence"),
        fetch("/api/workspace?file=MEMORY.md"),
      ]);

      const memoryData = await memoryRes.json();
      const intelligenceData = await intelligenceRes.json();
      const longTermData = await longTermRes.json();

      const parseFiles = (files: string[]): MemoryFile[] =>
        files
          .map((f) => ({
            name: f,
            date: f.replace(".md", ""),
          }))
          .sort((a, b) => b.date.localeCompare(a.date)); // Sort newest first

      setMemoryFiles(parseFiles(memoryData.files || []));
      setIntelligenceFiles(parseFiles(intelligenceData.files || []));
      setLongTermMemory(longTermData.content || "");

      // Auto-select today's file or most recent
      const today = new Date().toISOString().split("T")[0];
      const todayFile = `${today}.md`;
      if (memoryData.files?.includes(todayFile)) {
        setSelectedFile(todayFile);
        setSelectedType("memory");
      } else if (memoryData.files?.length > 0) {
        // Select most recent
        const sorted = [...memoryData.files].sort().reverse();
        setSelectedFile(sorted[0]);
        setSelectedType("memory");
      }
    } catch {
      setMemoryFiles([]);
      setIntelligenceFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchFileContent = async (file: string, type: "memory" | "intelligence") => {
    setContentLoading(true);
    try {
      const res = await fetch(`/api/memory?file=${file}&type=${type}`);
      const data = await res.json();
      setFileContent(data.content || "");
    } catch {
      setFileContent("");
    } finally {
      setContentLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  useEffect(() => {
    if (selectedFile) {
      fetchFileContent(selectedFile, selectedType);
    }
  }, [selectedFile, selectedType]);

  const formatDate = (dateStr: string): string => {
    try {
      const date = new Date(dateStr);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      if (dateStr === today.toISOString().split("T")[0]) {
        return "Today";
      }
      if (dateStr === yesterday.toISOString().split("T")[0]) {
        return "Yesterday";
      }
      return date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  // Render markdown-ish content with proper line breaks
  const renderContent = (content: string) => {
    return content.split("\n").map((line, i) => {
      if (line.startsWith("# ")) {
        return <h1 key={i} className="text-xl font-bold text-zinc-100 mt-4 first:mt-0 mb-2">{line.slice(2)}</h1>;
      }
      if (line.startsWith("## ")) {
        return <h2 key={i} className="text-lg font-semibold text-zinc-200 mt-3 mb-1">{line.slice(3)}</h2>;
      }
      if (line.startsWith("### ")) {
        return <h3 key={i} className="text-base font-medium text-zinc-300 mt-2 mb-1">{line.slice(4)}</h3>;
      }
      if (line.startsWith("- ")) {
        return (
          <div key={i} className="flex gap-2 pl-2 py-0.5">
            <span className="text-orange-500 shrink-0">•</span>
            <span className="text-zinc-300 break-words">{line.slice(2)}</span>
          </div>
        );
      }
      if (line.trim() === "") {
        return <div key={i} className="h-2" />;
      }
      return <p key={i} className="text-zinc-400 break-words py-0.5">{line}</p>;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Memory</h1>
          <p className="text-sm text-zinc-400">Daily notes & intelligence reports</p>
        </div>
        <button
          onClick={fetchFiles}
          disabled={loading}
          className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors btn-press disabled:opacity-50"
        >
          <RefreshCw
            className={`w-5 h-5 ${loading ? "animate-spin" : ""}`}
            strokeWidth={1.5}
          />
        </button>
      </header>

      {/* Tabs */}
      <Tabs defaultValue="daily" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 bg-zinc-900">
          <TabsTrigger value="daily" className="data-[state=active]:bg-zinc-800">
            <Calendar className="w-4 h-4 mr-2" />
            Daily
          </TabsTrigger>
          <TabsTrigger value="intelligence" className="data-[state=active]:bg-zinc-800">
            <Brain className="w-4 h-4 mr-2" />
            Intel
          </TabsTrigger>
          <TabsTrigger value="longterm" className="data-[state=active]:bg-zinc-800">
            <FileText className="w-4 h-4 mr-2" />
            Core
          </TabsTrigger>
        </TabsList>

        {/* Daily Memory */}
        <TabsContent value="daily" className="space-y-4">
          {/* Info Banner */}
          <div className="flex items-start gap-2 text-xs text-zinc-500 bg-zinc-900/50 rounded-lg p-3 border border-zinc-800/50">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong className="text-zinc-400">Daily Notes</strong> — One file per day containing observations, 
              thoughts, and activities. Newest dates shown first.
            </span>
          </div>

          {/* Date Selector */}
          <ScrollArea className="w-full whitespace-nowrap pb-2">
            <div className="flex gap-2">
              {loading ? (
                <>
                  <Skeleton className="h-10 w-24 skeleton-shimmer rounded-lg" />
                  <Skeleton className="h-10 w-24 skeleton-shimmer rounded-lg" />
                  <Skeleton className="h-10 w-24 skeleton-shimmer rounded-lg" />
                </>
              ) : memoryFiles.length === 0 ? (
                <p className="text-sm text-zinc-400">No daily notes yet</p>
              ) : (
                memoryFiles.map((file) => (
                  <button
                    key={file.name}
                    onClick={() => {
                      setSelectedFile(file.name);
                      setSelectedType("memory");
                    }}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm transition-colors shrink-0",
                      selectedFile === file.name && selectedType === "memory"
                        ? "bg-orange-500 text-white"
                        : "bg-zinc-900 border border-zinc-800 hover:bg-zinc-800"
                    )}
                  >
                    {formatDate(file.date)}
                  </button>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Content */}
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 sm:p-6 overflow-hidden">
            {contentLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full skeleton-shimmer" />
                <Skeleton className="h-4 w-3/4 skeleton-shimmer" />
                <Skeleton className="h-4 w-5/6 skeleton-shimmer" />
              </div>
            ) : fileContent && selectedType === "memory" ? (
              <div className="text-sm leading-relaxed overflow-x-hidden">
                {renderContent(fileContent)}
              </div>
            ) : (
              <p className="text-zinc-400 text-sm">Select a date to view notes</p>
            )}
          </div>
        </TabsContent>

        {/* Intelligence */}
        <TabsContent value="intelligence" className="space-y-4">
          {/* Info Banner */}
          <div className="flex items-start gap-2 text-xs text-zinc-500 bg-zinc-900/50 rounded-lg p-3 border border-zinc-800/50">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong className="text-zinc-400">Intelligence Reports</strong> — Analysis and insights gathered 
              from research, monitoring, and observations. Think of these as briefings.
            </span>
          </div>

          <ScrollArea className="w-full whitespace-nowrap pb-2">
            <div className="flex gap-2">
              {loading ? (
                <Skeleton className="h-10 w-24 skeleton-shimmer rounded-lg" />
              ) : intelligenceFiles.length === 0 ? (
                <p className="text-sm text-zinc-400">No intelligence reports yet</p>
              ) : (
                intelligenceFiles.map((file) => (
                  <button
                    key={file.name}
                    onClick={() => {
                      setSelectedFile(file.name);
                      setSelectedType("intelligence");
                    }}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm transition-colors shrink-0",
                      selectedFile === file.name && selectedType === "intelligence"
                        ? "bg-orange-500 text-white"
                        : "bg-zinc-900 border border-zinc-800 hover:bg-zinc-800"
                    )}
                  >
                    {formatDate(file.date)}
                  </button>
                ))
              )}
            </div>
          </ScrollArea>

          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 sm:p-6 overflow-hidden">
            {contentLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full skeleton-shimmer" />
                <Skeleton className="h-4 w-3/4 skeleton-shimmer" />
              </div>
            ) : fileContent && selectedType === "intelligence" ? (
              <div className="text-sm leading-relaxed overflow-x-hidden">
                {renderContent(fileContent)}
              </div>
            ) : (
              <p className="text-zinc-400 text-sm">Select a date to view intelligence</p>
            )}
          </div>
        </TabsContent>

        {/* Long-term Memory */}
        <TabsContent value="longterm">
          {/* Info Banner */}
          <div className="flex items-start gap-2 text-xs text-zinc-500 bg-zinc-900/50 rounded-lg p-3 border border-zinc-800/50 mb-4">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong className="text-zinc-400">Core Memory</strong> — Persistent knowledge and context 
              that the agent carries across all conversations. This is MEMORY.md.
            </span>
          </div>

          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 sm:p-6 overflow-hidden">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-orange-500" />
              <h3 className="font-medium">MEMORY.md</h3>
              <Badge variant="secondary">Core</Badge>
            </div>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full skeleton-shimmer" />
                <Skeleton className="h-4 w-3/4 skeleton-shimmer" />
                <Skeleton className="h-4 w-5/6 skeleton-shimmer" />
              </div>
            ) : longTermMemory ? (
              <div className="text-sm leading-relaxed overflow-x-hidden">
                {renderContent(longTermMemory)}
              </div>
            ) : (
              <p className="text-zinc-400 text-sm">No long-term memory configured</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
