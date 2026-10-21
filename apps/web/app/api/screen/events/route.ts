import { screenStream } from "../../../../lib/screen-stream";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return screenStream(request);
}
