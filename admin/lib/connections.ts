import dns, { type LookupAddress } from "node:dns";
import { Agent, setGlobalDispatcher } from "undici";

// Every portal page waits on Supabase, so the cost of reaching it decides how
// fast the portal feels. Two things made that cost large on a slow network:
// Node closes an idle connection after 4 s, so most page loads paid for a new
// TLS handshake, and each new connection asked the DNS server for Supabase's
// address, which through a school or home router took 5 to 30 s.
//
// The portal's server therefore keeps connections open for a minute, and
// remembers each host's addresses: a known address is used at once and is
// refreshed in the background, so a slow DNS server can delay only the very
// first request after the server starts.

const REFRESH_MS = 4 * 60_000;

const known = new Map<string, LookupAddress[]>();
const pending = new Map<string, Promise<LookupAddress[]>>();

function resolve(hostname: string): Promise<LookupAddress[]> {
  let lookup = pending.get(hostname);
  if (!lookup) {
    lookup = dns.promises
      .lookup(hostname, { all: true })
      .then((addresses) => {
        known.set(hostname, addresses);
        return addresses;
      })
      .finally(() => pending.delete(hostname));
    pending.set(hostname, lookup);
  }
  return lookup;
}

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

// The signature of dns.lookup, which Node's sockets call for every new connection.
export function cachedLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback): void {
  const want = options.family === "IPv4" ? 4 : options.family === "IPv6" ? 6 : Number(options.family) || 0;
  const reply = (addresses: LookupAddress[]) => {
    const usable = want ? addresses.filter((a) => a.family === want) : addresses;
    const first = usable[0];
    if (!first) {
      callback(Object.assign(new Error(`no address for ${hostname}`), { code: "ENOTFOUND" }), "");
    } else if (options.all) {
      callback(null, usable);
    } else {
      callback(null, first.address, first.family);
    }
  };
  const addresses = known.get(hostname);
  if (addresses) {
    reply(addresses);
  } else {
    resolve(hostname).then(reply, (error: NodeJS.ErrnoException) => callback(error, ""));
  }
}

// Installs the connection settings for every fetch the server makes,
// including the Supabase clients', and looks Supabase up before the first
// visitor arrives; the address is refreshed every few minutes while the
// server runs, and an old address stays in use if a refresh fails.
export function installFastConnections(supabaseUrl: string): void {
  setGlobalDispatcher(
    new Agent({
      keepAliveTimeout: 60_000,
      keepAliveMaxTimeout: 10 * 60_000,
      connect: { lookup: cachedLookup },
    }),
  );
  const host = new URL(supabaseUrl).hostname;
  resolve(host).catch(() => undefined);
  setInterval(() => resolve(host).catch(() => undefined), REFRESH_MS).unref();
}
