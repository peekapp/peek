import { screenStream } from "../../../../../lib/screen-stream";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return screenStream(request, (await params).id);
}
