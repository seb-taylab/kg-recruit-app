/**
 * @used-by app/apply/[token]/actions.ts (photo + NRIC upload paths)
 *
 * Shared defensive validation for client-supplied file uploads.
 *
 * Three checks per call, in order:
 *   1. Size cap — reject before any other work so a 2 GB blob doesn't
 *      keep the function alive long enough to do magic-byte work.
 *   2. Content-Type allowlist — `contentType` is client-supplied, so
 *      this is a quick first-pass guard, not the authoritative signal.
 *   3. Magic-byte sniff — the authoritative check. Looks at the first
 *      few bytes of the buffer against well-known format headers.
 *      Cheap (a few index reads); doesn't pull the bytes through any
 *      parser.
 *
 * Sebastian's 2026-05-16 security audit findings H1 + H2:
 *   - uploadNricAction: accepted any content-type, any size
 *   - uploadPhotoAction: ignored client content-type, no size cap
 */

export type SupportedKind = "jpeg" | "png" | "webp" | "pdf";

interface KindSpec {
  mimes: string[];
  magic: (b: Uint8Array) => boolean;
}

const SPECS: Record<SupportedKind, KindSpec> = {
  // JPEG: starts with FF D8 FF
  jpeg: {
    mimes: ["image/jpeg", "image/jpg"],
    magic: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  png: {
    mimes: ["image/png"],
    magic: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  // WEBP: bytes 0..3 = "RIFF", 8..11 = "WEBP"
  webp: {
    mimes: ["image/webp"],
    magic: (b) =>
      b.length >= 12 &&
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
  // PDF: %PDF (25 50 44 46) within the first 1024 bytes (PDFs sometimes
  // have a comment line first; the spec allows offset).
  pdf: {
    mimes: ["application/pdf"],
    magic: (b) => {
      const window = Math.min(b.length, 1024);
      for (let i = 0; i <= window - 4; i++) {
        if (
          b[i] === 0x25 && b[i + 1] === 0x50 && b[i + 2] === 0x44 && b[i + 3] === 0x46
        ) {
          return true;
        }
      }
      return false;
    },
  },
};

export interface ValidateUploadInput {
  buffer: ArrayBuffer | Uint8Array;
  /** Client-supplied. Validated against `allow`, but the magic-byte check is the authority. */
  contentType: string;
  /** Reject if the buffer is larger than this. */
  maxBytes: number;
  /** Which kinds the caller wants to accept. */
  allow: SupportedKind[];
}

export type ValidateUploadResult =
  | { ok: true; bytes: Uint8Array; kind: SupportedKind }
  | { ok: false; error: string };

/**
 * Validate a client-uploaded buffer. Returns the byte view + the
 * detected `kind` on success, or a friendly error string on failure.
 * Callers can pass the result's `kind` straight to the storage layer
 * to derive the file extension safely.
 */
export function validateUpload(input: ValidateUploadInput): ValidateUploadResult {
  const bytes =
    input.buffer instanceof Uint8Array ? input.buffer : new Uint8Array(input.buffer);

  if (bytes.byteLength === 0) {
    return { ok: false, error: "File is empty." };
  }
  if (bytes.byteLength > input.maxBytes) {
    const mb = (input.maxBytes / (1024 * 1024)).toFixed(0);
    return { ok: false, error: `File is too large. Max ${mb} MB.` };
  }

  // First-pass content-type allowlist. Trust nothing: if the client
  // claims an allowed MIME but the bytes don't match any of the allowed
  // kinds, reject.
  const lowerCT = input.contentType.toLowerCase().trim();
  const mimeMatches = input.allow.some((k) => SPECS[k].mimes.includes(lowerCT));
  if (!mimeMatches) {
    return {
      ok: false,
      error: `Unsupported file type "${input.contentType}". Allowed: ${input.allow.join(", ")}.`,
    };
  }

  // Magic-byte sniff — authoritative.
  for (const kind of input.allow) {
    if (SPECS[kind].magic(bytes)) {
      // Optional cross-check: the magic bytes should also match the
      // claimed content-type. If a client claims "image/jpeg" but the
      // bytes are a PNG, that's suspicious — reject. Helps defend
      // against extension confusion in storage paths.
      if (!SPECS[kind].mimes.includes(lowerCT)) {
        return {
          ok: false,
          error: `File content doesn't match its declared type "${input.contentType}".`,
        };
      }
      return { ok: true, bytes, kind };
    }
  }

  return {
    ok: false,
    error: "File content isn't a recognised image or PDF.",
  };
}

/** Extension to use in the storage path, given a validated upload kind. */
export function extensionFor(kind: SupportedKind): string {
  switch (kind) {
    case "jpeg": return "jpg";
    case "png": return "png";
    case "webp": return "webp";
    case "pdf": return "pdf";
  }
}

/**
 * Canonical Content-Type header to store alongside the bytes. Use this
 * when calling Supabase Storage's upload() so the server sets the
 * served Content-Type from a known-safe string, not from whatever the
 * client claimed.
 */
export function canonicalContentType(kind: SupportedKind): string {
  switch (kind) {
    case "jpeg": return "image/jpeg";
    case "png": return "image/png";
    case "webp": return "image/webp";
    case "pdf": return "application/pdf";
  }
}
