// Next.js runs this once when the portal's server starts.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { installFastConnections } = await import("./lib/connections");
  installFastConnections(process.env.NEXT_PUBLIC_SUPABASE_URL!);
}
