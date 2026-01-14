import { useState, useEffect, useCallback } from "react";
import {
  X,
  Folder,
  FolderOpen,
  Clock,
  ChevronRight,
  ChevronUp,
  Search,
  Loader2,
} from "lucide-react";
import { cn } from "../lib/utils";
import { useSessionStore } from "../store/sessionStore";

interface ProjectSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
}

interface ProjectItem {
  path: string;
  name: string;
  isRecent: boolean;
}

interface DirectoryItem {
  name: string;
  path: string;
}

interface BrowseResponse {
  currentPath: string;
  parentPath: string | null;
  directories: DirectoryItem[];
}

export function ProjectSelector({ isOpen, onClose, onSelect }: ProjectSelectorProps) {
  const { serverUrl } = useSessionStore();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const [browseData, setBrowseData] = useState<BrowseResponse | null>(null);

  // プロジェクト一覧を取得
  const fetchProjects = useCallback(async () => {
    if (!serverUrl) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${serverUrl}/api/projects`);
      if (!res.ok) throw new Error("Failed to fetch projects");
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, [serverUrl]);

  // ディレクトリをブラウズ
  const browseDirectory = useCallback(
    async (path: string) => {
      if (!serverUrl) return;

      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `${serverUrl}/api/browse?path=${encodeURIComponent(path)}`
        );
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to browse directory");
        }
        const data = await res.json();
        setBrowseData(data);
        setBrowsing(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "エラーが発生しました");
      } finally {
        setLoading(false);
      }
    },
    [serverUrl]
  );

  // モーダルが開いたときにプロジェクト一覧を取得
  useEffect(() => {
    if (isOpen) {
      fetchProjects();
      setBrowsing(false);
      setBrowseData(null);
      setSearchQuery("");
    }
  }, [isOpen, fetchProjects]);

  // プロジェクトを選択
  const handleSelect = useCallback(
    (path: string) => {
      onSelect(path);
      onClose();
    },
    [onSelect, onClose]
  );

  // フィルタリングされたプロジェクト
  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 最近使用したプロジェクトとその他を分離
  const recentProjects = filteredProjects.filter((p) => p.isRecent);
  const otherProjects = filteredProjects.filter((p) => !p.isRecent);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-4 z-50 flex items-start justify-center pt-8">
        <div className="w-full max-w-md bg-slate-800 rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[80vh]">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-700">
            <h2 className="text-lg font-semibold text-white">
              {browsing ? "フォルダを選択" : "プロジェクトを選択"}
            </h2>
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-white transition-colors"
              aria-label="閉じる"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search / Navigation */}
          <div className="p-3 border-b border-slate-700">
            {browsing ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setBrowsing(false);
                    setBrowseData(null);
                  }}
                  className="p-2 text-slate-400 hover:text-white transition-colors"
                  aria-label="戻る"
                >
                  <ChevronUp className="w-5 h-5" />
                </button>
                <div className="flex-1 text-sm text-slate-300 truncate">
                  {browseData?.currentPath}
                </div>
                {browseData?.currentPath && (
                  <button
                    onClick={() => handleSelect(browseData.currentPath)}
                    className={cn(
                      "px-3 py-1.5 rounded text-sm",
                      "bg-blue-600 hover:bg-blue-500 text-white",
                      "transition-colors"
                    )}
                  >
                    選択
                  </button>
                )}
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="プロジェクトを検索..."
                  className={cn(
                    "w-full pl-10 pr-4 py-2 rounded-lg",
                    "bg-slate-700 text-white placeholder:text-slate-500",
                    "border border-slate-600 focus:border-blue-500",
                    "focus:outline-none focus:ring-1 focus:ring-blue-500"
                  )}
                />
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
              </div>
            ) : error ? (
              <div className="p-4 text-center text-red-400 text-sm">{error}</div>
            ) : browsing ? (
              // ディレクトリブラウズモード
              <div className="py-2">
                {browseData?.parentPath && (
                  <button
                    onClick={() => browseDirectory(browseData.parentPath!)}
                    className={cn(
                      "w-full px-4 py-2.5 flex items-center gap-3",
                      "hover:bg-slate-700/50 transition-colors text-left"
                    )}
                  >
                    <ChevronUp className="w-4 h-4 text-slate-500" />
                    <span className="text-sm text-slate-400">..</span>
                  </button>
                )}
                {browseData?.directories.map((dir) => (
                  <button
                    key={dir.path}
                    onClick={() => browseDirectory(dir.path)}
                    className={cn(
                      "w-full px-4 py-2.5 flex items-center gap-3",
                      "hover:bg-slate-700/50 transition-colors text-left"
                    )}
                  >
                    <Folder className="w-4 h-4 text-amber-500" />
                    <span className="flex-1 text-sm text-slate-200 truncate">
                      {dir.name}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  </button>
                ))}
                {browseData?.directories.length === 0 && (
                  <div className="p-4 text-center text-slate-500 text-sm">
                    サブフォルダがありません
                  </div>
                )}
              </div>
            ) : (
              // プロジェクト一覧モード
              <div className="py-2">
                {recentProjects.length > 0 && (
                  <div className="mb-4">
                    <h3 className="px-4 py-1 text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      最近使用したプロジェクト
                    </h3>
                    {recentProjects.map((project, index) => (
                      <ProjectItem
                        key={`recent-${index}-${project.path}`}
                        project={project}
                        onSelect={handleSelect}
                        onBrowse={browseDirectory}
                      />
                    ))}
                  </div>
                )}

                {otherProjects.length > 0 && (
                  <div>
                    <h3 className="px-4 py-1 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      その他のプロジェクト
                    </h3>
                    {otherProjects.map((project, index) => (
                      <ProjectItem
                        key={`other-${index}-${project.path}`}
                        project={project}
                        onSelect={handleSelect}
                        onBrowse={browseDirectory}
                      />
                    ))}
                  </div>
                )}

                {filteredProjects.length === 0 && (
                  <div className="p-4 text-center text-slate-500 text-sm">
                    プロジェクトが見つかりません
                  </div>
                )}

                {/* Browse button */}
                <div className="p-3 mt-4 border-t border-slate-700">
                  <button
                    onClick={() => browseDirectory("")}
                    className={cn(
                      "w-full flex items-center justify-center gap-2",
                      "py-2 px-4 rounded-lg",
                      "bg-slate-700 hover:bg-slate-600",
                      "text-slate-300 text-sm",
                      "transition-colors"
                    )}
                  >
                    <FolderOpen className="w-4 h-4" />
                    フォルダを参照...
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

interface ProjectItemComponentProps {
  project: ProjectItem;
  onSelect: (path: string) => void;
  onBrowse: (path: string) => void;
}

function ProjectItem({ project, onSelect, onBrowse }: ProjectItemComponentProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2.5",
        "hover:bg-slate-700/50 transition-colors"
      )}
    >
      <button
        onClick={() => onSelect(project.path)}
        className="flex-1 flex items-center gap-3 text-left min-w-0"
      >
        <Folder className="w-4 h-4 text-amber-500 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-sm text-slate-200 truncate">{project.name}</p>
          <p className="text-xs text-slate-500 truncate">{project.path}</p>
        </div>
      </button>
      <button
        onClick={() => onBrowse(project.path)}
        className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors"
        aria-label="サブフォルダを表示"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
