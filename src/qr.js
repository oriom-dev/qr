import QRCode from "qrcode";
import { estimateHeadroom } from "./qr-headroom.js";

const FINDER = "M0,2A2,2 0 0 1 2,0h3A2,2 0 0 1 7,2v3A2,2 0 0 1 5,7H2A2,2 0 0 1 0,5zM1,2A1,1 0 0 1 2,1h3A1,1 0 0 1 6,2v3A1,1 0 0 1 5,6H2A1,1 0 0 1 1,5zM2,3.5a1.5,1.5 0 1 0 3,0a1.5,1.5 0 1 0 -3,0";
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Create a self-contained SVG. Image offsets are measured in modules. */
export function createQr(text, options = {}) {
  return createQrWithAnalysis(text, options).svg;
}

export function createQrWithAnalysis(text, options = {}) {
  if (typeof text !== "string" || !text) throw new TypeError("QR text must be a non-empty string");
  const { rounded = true, transparent = false, image = null, imageSize = 0.2, imageX = 0, imageY = 0, imageAspect = 1, version, maskPattern, margin = 4, autoVersionForImage = true } = options;
  if (typeof autoVersionForImage !== "boolean") throw new TypeError("autoVersionForImage must be a boolean");
  if (version !== undefined && (!Number.isInteger(version) || version < 1 || version > 40)) throw new TypeError("QR version must be an integer from 1 to 40");
  if (maskPattern !== undefined && (!Number.isInteger(maskPattern) || maskPattern < 0 || maskPattern > 7)) throw new TypeError("QR mask pattern must be an integer from 0 to 7");
  if (margin !== 0 && margin !== 4) throw new TypeError("QR margin must be 0 or 4");
  if (image && (typeof image !== "string" || !/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(image))) {
    throw new TypeError("QR image must be a base64 PNG, JPEG, GIF, WebP, or SVG data URL");
  }
  if (image && (![imageSize, imageX, imageY, imageAspect].every(Number.isFinite) || imageSize <= 0 || imageAspect <= 0)) {
    throw new TypeError("Image size and offsets must be finite numbers, and size must be positive");
  }

  const minimumQr = QRCode.create(text, { errorCorrectionLevel: "H" });
  // Preserve the encoder's error for an explicitly selected version that cannot hold the data.
  if (version !== undefined && version < minimumQr.version) {
    QRCode.create(text, { errorCorrectionLevel: "H", version, maskPattern });
  }
  const bounds = count => {
    const size = image ? Math.min(imageSize, 0.5) * count : 0;
    const width = size * Math.min(1, imageAspect);
    const height = size * Math.min(1, 1 / imageAspect);
    const x = clamp((count - width) / 2 + imageX, 8, count - 8 - width);
    const y = clamp((count - height) / 2 + imageY, 8, count - 8 - height);
    return { x, y, width, height, covered: (r, c) => !!image && c < x + width && c + 1 > x && r < y + height && r + 1 > y };
  };
  let selectedVersion = version ?? minimumQr.version;
  let headroom;
  if (image && autoVersionForImage) {
    let best;
    // ponytail: search at most eight versions to bound synchronous UI work; widen or move to a worker if needed.
    const end = Math.min(40, selectedVersion + 7);
    for (let candidate = selectedVersion; candidate <= end; candidate++) {
      const probe = QRCode.create(text, { errorCorrectionLevel: "H", version: candidate, maskPattern: 0 });
      const estimate = estimateHeadroom(probe, bounds(probe.modules.size).covered);
      if (!best || estimate.reserved < best.headroom.reserved ||
          (estimate.reserved === best.headroom.reserved && estimate.remaining > best.headroom.remaining)) {
        best = { version: candidate, headroom: estimate };
      }
      if (estimate.reserved === 0 && estimate.remaining > 0) {
        best = { version: candidate, headroom: estimate };
        break;
      }
    }
    selectedVersion = best.version;
    headroom = best.headroom;
  }
  const qr = selectedVersion === minimumQr.version && maskPattern === undefined
    ? minimumQr
    : QRCode.create(text, { errorCorrectionLevel: "H", version: selectedVersion, maskPattern });
  const modules = qr.modules;
  const count = modules.size;
  const { x, y, width, height, covered } = bounds(count);
  headroom ??= estimateHeadroom(qr, covered);
  const black = (r, c) => r >= 0 && c >= 0 && r < count && c < count && !covered(r, c) && modules.get(r, c) === 1;
  const finder = (r, c) => (r < 7 && (c < 7 || c >= count - 7)) || (r >= count - 7 && c < 7);
  let path = "";
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (!black(r, c) || (rounded && finder(r, c))) continue;
      if (!rounded) {
        path += `M${c} ${r}h1v1h-1z`;
        continue;
      }
      const top = black(r - 1, c), bottom = black(r + 1, c);
      const left = black(r, c - 1), right = black(r, c + 1);
      path += !top && !left ? `M${c} ${r + 0.5}a.5.5 0 0 1 .5-.5` : `M${c} ${r}h.5`;
      path += !top && !right ? "a.5.5 0 0 1 .5.5" : "h.5v.5";
      path += !bottom && !right ? "a.5.5 0 0 1 -.5.5" : "v.5h-.5";
      path += !bottom && !left ? "a.5.5 0 0 1 -.5-.5z" : "h-.5z";
    }
  }

  const total = count + 2 * margin;
  let content = `<path d="${path}"/>`;
  if (rounded) {
    content += `<defs><path id="finder" d="${FINDER}"/></defs><g fill-rule="evenodd"><use href="#finder"/><use href="#finder" x="${count - 7}"/><use href="#finder" y="${count - 7}"/></g>`;
  }
  if (image) {
    content += `<image href="${image}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${total}" height="${total}" shape-rendering="geometricPrecision">${transparent ? "" : `<path fill="white" d="M0 0h${total}v${total}H0z"/>`}<g fill="black" transform="translate(${margin} ${margin})">${content}</g></svg>`;
  const warning = image && (headroom.reserved > 0 || headroom.remaining <= 0)
    ? "Image overlaps reserved modules or exceeds estimated correction headroom; scanability is not guaranteed."
    : null;
  return { svg, headroom, version: qr.version, maskPattern: qr.maskPattern, minimumVersion: minimumQr.version, warning };
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function downloadSvg(svg) {
  if (typeof svg !== "string" || !svg) throw new TypeError("SVG must be a non-empty string");
  download(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), "qr.svg");
}

export async function downloadPng(svg) {
  if (typeof svg !== "string" || !svg) throw new TypeError("SVG must be a non-empty string");
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("Could not load the QR SVG for PNG export"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 2048;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable for PNG export");
    context.drawImage(image, 0, 0, 2048, 2048);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(result => result ? resolve(result) : reject(new Error("Could not encode the QR PNG")), "image/png");
    });
    download(blob, "qr.png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
