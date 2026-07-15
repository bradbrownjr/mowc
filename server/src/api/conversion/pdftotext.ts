import { spawn } from "node:child_process";

/**
 * Sandboxed poppler subprocess wrappers for the admin PDF conversion endpoint
 * (docs/adr/0001-admin-pdf-to-pack-conversion.md section 2).
 *
 * Every invocation:
 *  - uses a fixed argv array via child_process.spawn (never a shell string),
 *    so no user-supplied value can become an argument or a path,
 *  - pipes PDF bytes on stdin and reads text on stdout (no temp file),
 *  - is killed on a wall-clock timeout or an output-size breach.
 *
 * No PDF is ever written to disk; the bytes live only in memory for the life
 * of the request.
 */

const TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024; // 4 MB captured stdout cap.

export type PdfExtractionReason =
  | "spawn-failed"
  | "nonzero-exit"
  | "timeout"
  | "output-too-large"
  | "empty-output";

/** Extraction failed for a reason the route maps to HTTP 422. */
export class PdfExtractionError extends Error {
  constructor(
    readonly reason: PdfExtractionReason,
    message: string
  ) {
    super(message);
    this.name = "PdfExtractionError";
  }
}

/** A PDF must start with the `%PDF-` magic bytes. */
export function isPdf(bytes: Buffer): boolean {
  return bytes.length >= 5 && bytes.subarray(0, 5).toString("latin1") === "%PDF-";
}

interface RunOptions {
  /** When true, an empty stdout is an error (`empty-output`). */
  requireOutput: boolean;
}

/**
 * Run a poppler command with the PDF on stdin, returning stdout as a string.
 * `args` is a fixed argv array supplied by the caller, never derived from
 * request data.
 */
function runPoppler(command: string, args: string[], pdf: Buffer, opts: RunOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });

    const chunks: Buffer[] = [];
    let captured = 0;
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() =>
        reject(new PdfExtractionError("timeout", `${command} exceeded ${TIMEOUT_MS}ms`))
      );
    }, TIMEOUT_MS);

    child.on("error", (err) => {
      finish(() =>
        reject(new PdfExtractionError("spawn-failed", `${command} failed to start: ${err.message}`))
      );
    });

    child.stdout.on("data", (chunk: Buffer) => {
      captured += chunk.length;
      if (captured > MAX_OUTPUT_BYTES) {
        child.kill("SIGKILL");
        finish(() =>
          reject(new PdfExtractionError("output-too-large", `${command} output exceeded 4 MB`))
        );
        return;
      }
      chunks.push(chunk);
    });

    // Drain stderr so the pipe buffer cannot fill and stall the child.
    child.stderr.on("data", () => {});

    child.on("close", (code) => {
      finish(() => {
        if (code !== 0) {
          reject(new PdfExtractionError("nonzero-exit", `${command} exited with code ${code}`));
          return;
        }
        const text = Buffer.concat(chunks).toString("utf-8");
        if (opts.requireOutput && text.trim().length === 0) {
          reject(new PdfExtractionError("empty-output", `${command} produced no usable text`));
          return;
        }
        resolve(text);
      });
    });

    // A broken stdin pipe (child died first) surfaces via the close/error
    // handlers above; swallow the write error so it does not crash the process.
    child.stdin.on("error", () => {});
    child.stdin.end(pdf);
  });
}

/** Extract layout-preserving text with `pdftotext -layout - -`. */
export function extractPdfText(pdf: Buffer): Promise<string> {
  return runPoppler("pdftotext", ["-layout", "-", "-"], pdf, { requireOutput: true });
}

export interface PdfMetadata {
  title?: string;
  author?: string;
}

/**
 * Read Title/Author from the PDF's info dictionary with `pdfinfo - `. Best
 * effort: any failure yields empty metadata rather than failing the whole
 * conversion, since the parser has sane defaults (ADR section 3).
 */
export async function extractPdfMetadata(pdf: Buffer): Promise<PdfMetadata> {
  let raw: string;
  try {
    raw = await runPoppler("pdfinfo", ["-"], pdf, { requireOutput: false });
  } catch {
    return {};
  }
  const meta: PdfMetadata = {};
  for (const line of raw.split("\n")) {
    const match = /^(Title|Author):\s+(.*\S)\s*$/.exec(line);
    if (match?.[2]) {
      const value = match[2].trim();
      if (value.length > 0) {
        if (match[1] === "Title") {
          meta.title = value;
        } else {
          meta.author = value;
        }
      }
    }
  }
  return meta;
}
