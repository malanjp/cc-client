import { Loader2 } from "lucide-react";

export function LoadingIndicator() {
  return (
    <div className="flex gap-3 p-4 rounded-lg bg-slate-800/30">
      <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-emerald-600">
        <Loader2 className="w-4 h-4 text-white animate-spin" />
      </div>
      <div className="flex-1 flex items-center">
        <span className="text-sm text-slate-400">考え中...</span>
      </div>
    </div>
  );
}
