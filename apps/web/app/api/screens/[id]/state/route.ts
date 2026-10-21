import { readState } from "../../../../../lib/server-state";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return Response.json(readState((await params).id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: "unavailable" },
      {
        status:
          error instanceof Error && error.message === "screen-not-found"
            ? 404
            : 503,
      },
    );
  }
}
