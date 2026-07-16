import { Router, type Request, type Response } from "express";
import { isAdmin } from "../../authz/admin.js";
import { createConversionRateLimiter } from "../../auth/rateLimit.js";
import { PdfExtractionError, extractPdfMetadata, extractPdfText, isPdf } from "./pdftotext.js";
import { reflowLayout } from "./reflow.js";
import { parseConversion } from "./parse.js";

/**
 * Admin PDF-to-content-pack conversion endpoint
 * (docs/adr/0001-admin-pdf-to-pack-conversion.md).
 *
 * POST /api/admin/conversions  Content-Type: application/pdf (raw bytes)
 *
 * Stateless: the PDF is never written to disk and no draft is persisted. The
 * bytes are piped to poppler, the extracted text is reflowed and split into
 * draft packs, and the ConversionResult is returned in the response body. The
 * admin reviews and saves each draft through the existing content-pack
 * pipeline.
 *
 * The route is mounted behind requireAuth, requireAdmin, and express.raw, in
 * that order (see app.ts), so a non-admin request is rejected before its body
 * is ever buffered; the isAdmin check below is defense in depth against a
 * future mount without that middleware. Here it also enforces the PDF
 * magic-byte check and single-flight concurrency. The 25 MB body limit and
 * 10/hour rate limit are applied by the raw parser and the rate limiter
 * respectively.
 */

// At most one conversion runs per server process at a time (ADR section 2):
// pdftotext is a subprocess with real CPU/memory cost, so a second concurrent
// request is rejected with 429 rather than piling on.
let conversionInFlight = false;

export function createConversionRouter(adminEmail: string | undefined): Router {
  const router = Router();
  const rateLimiter = createConversionRateLimiter();

  router.post("/", rateLimiter, async (req: Request, res: Response) => {
    // requireAuth (mounted ahead of this router) guarantees req.user is set.
    if (!isAdmin(req.user!, adminEmail)) {
      res.status(403).json({ errors: [{ path: "", message: "admin only" }] });
      return;
    }

    const body: unknown = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ errors: [{ path: "", message: "empty or non-PDF body" }] });
      return;
    }
    if (!isPdf(body)) {
      res.status(400).json({ errors: [{ path: "", message: "body is not a PDF (missing %PDF- header)" }] });
      return;
    }

    if (conversionInFlight) {
      res.status(429).json({ errors: [{ path: "", message: "a conversion is already in progress" }] });
      return;
    }

    conversionInFlight = true;
    try {
      const rawText = await extractPdfText(body);
      const meta = await extractPdfMetadata(body);
      const text = reflowLayout(rawText);
      const result = parseConversion({
        text,
        title: meta.title,
        author: meta.author,
        adminDisplayName: req.user!.displayName
      });
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof PdfExtractionError) {
        console.warn(`422 pdf conversion failed user=${req.user!.id} reason=${err.reason}`);
        res.status(422).json({ errors: [{ path: "", message: "could not extract text from the PDF" }] });
        return;
      }
      throw err;
    } finally {
      conversionInFlight = false;
    }
  });

  return router;
}
