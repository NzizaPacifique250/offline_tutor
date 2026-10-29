import { getClient, requireAdmin } from "@/lib/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The release file exactly as it was published, for a tablet with no
// internet: copied onto the tablet, it is imported from Teacher tools. Its
// SHA-256 is the checksum on the Content page.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });
  const [, supabase] = await Promise.all([requireAdmin(), getClient()]);

  const { data, error } = await supabase
    .from("content_releases")
    .select("package_id, version, package_text")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("release download failed:", error.message);
    return new Response("The release could not be read. Try again.", { status: 502 });
  }
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(data.package_text as string, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${data.package_id}-${data.version}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
