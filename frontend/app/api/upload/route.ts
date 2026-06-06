import { NextResponse } from "next/server";
import sharp from "sharp";

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const AVATAR_EDGE = 512;
const MAX_AVATAR_OUTPUT_BYTES = 450_000;

async function buildAvatarDataUrl(file: File): Promise<string> {
  const input = Buffer.from(await file.arrayBuffer());
  const basePipeline = sharp(input, { animated: false }).rotate().resize({
    width: AVATAR_EDGE,
    height: AVATAR_EDGE,
    fit: "cover",
    position: "attention",
    withoutEnlargement: false,
  });

  // Iteratively reduce quality to keep payloads small enough for proxy/backend hops.
  let quality = 84;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const output = await basePipeline.clone().webp({ quality, effort: 4 }).toBuffer();

    if (output.byteLength <= MAX_AVATAR_OUTPUT_BYTES || quality <= 52) {
      return `data:image/webp;base64,${output.toString("base64")}`;
    }

    quality -= 10;
  }

  const finalOutput = await basePipeline.clone().webp({ quality: 50, effort: 4 }).toBuffer();
  return `data:image/webp;base64,${finalOutput.toString("base64")}`;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Unsupported file type. Use png, jpg, jpeg, webp, or gif." },
      { status: 400 },
    );
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return NextResponse.json({ error: "File too large. Max size is 10MB." }, { status: 400 });
  }

  const dataUrl = await buildAvatarDataUrl(file);

  return NextResponse.json({
    message: "Upload successful.",
    url: dataUrl,
  });
}
