import { existsSync, mkdirSync, appendFileSync } from "node:fs";
import path from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

// Configuration from environment variables
const LOG_LEVEL = (process.env.LOG_LEVEL || "info") as LogLevel;
const LOG_FILE = process.env.LOG_FILE || null; // null = console only
const LOG_TO_CONSOLE = process.env.LOG_TO_CONSOLE !== "false";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private logFile: string | null;
  private minLevel: number;
  private toConsole: boolean;

  constructor() {
    this.logFile = LOG_FILE;
    this.minLevel = LOG_LEVEL_PRIORITY[LOG_LEVEL];
    this.toConsole = LOG_TO_CONSOLE;

    // Create log directory if needed
    if (this.logFile) {
      const logDir = path.dirname(this.logFile);
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= this.minLevel;
  }

  private formatEntry(entry: LogEntry): string {
    return JSON.stringify(entry);
  }

  private writeToFile(line: string): void {
    if (this.logFile) {
      try {
        appendFileSync(this.logFile, line + "\n");
      } catch (error) {
        console.error("[Logger] Failed to write to log file:", error);
      }
    }
  }

  private writeToConsole(level: LogLevel, entry: LogEntry): void {
    if (!this.toConsole) return;

    const { timestamp, message, context } = entry;
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

    switch (level) {
      case "debug":
        console.debug(prefix, message, context ? context : "");
        break;
      case "info":
        console.info(prefix, message, context ? context : "");
        break;
      case "warn":
        console.warn(prefix, message, context ? context : "");
        break;
      case "error":
        console.error(prefix, message, context ? context : "");
        break;
    }
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(context && { context }),
    };

    // Write to console
    this.writeToConsole(level, entry);

    // Write to file (JSON format)
    if (this.logFile) {
      this.writeToFile(this.formatEntry(entry));
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log("debug", message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log("info", message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log("warn", message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log("error", message, context);
  }
}

// Singleton instance
export const logger = new Logger();
