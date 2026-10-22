import { BlockList, isIP } from "node:net";

// Decides whether an IP address is safe for the server to connect to on a
// student's behalf. The student controls the Canvas hostname, so without this
// a hostname could point at localhost, the private network, or a cloud
// metadata service (169.254.169.254) and turn Rushd into a proxy into
// infrastructure it can reach and the student can't.
//
// Allow-list in spirit: an address is acceptable only if it is a normal,
// globally-routable unicast address. Everything reserved, private, loopback,
// link-local, multicast, documentation, or otherwise special is refused —
// including IPv4 hidden inside IPv6 (::ffff:127.0.0.1, NAT64, 6to4, Teredo).

const blocked = new BlockList();

const V4_BLOCKS: [string, number][] = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local — incl. cloud metadata 169.254.169.254
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // 6to4 relay (deprecated)
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast (255.255.255.255)
];
for (const [net, prefix] of V4_BLOCKS) blocked.addSubnet(net, prefix, "ipv4");

const V6_BLOCKS: [string, number][] = [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["64:ff9b::", 96], // NAT64 (embeds IPv4; checked separately too)
  ["64:ff9b:1::", 48], // local-use NAT64
  ["100::", 64], // discard-only
  ["2001::", 32], // Teredo
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4 (embeds IPv4)
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local (deprecated)
  ["ff00::", 8], // multicast
];
for (const [net, prefix] of V6_BLOCKS) blocked.addSubnet(net, prefix, "ipv6");

/** Extracts the IPv4 address embedded in an IPv4-mapped/compatible IPv6
 * address (::ffff:a.b.c.d, ::ffff:0:a.b.c.d, ::a.b.c.d), if any. */
function embeddedIPv4(ip: string): string | null {
  const lower = ip.toLowerCase();
  const dotted = lower.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted && lower.includes(":")) return dotted[1];
  // Hex-group form, e.g. ::ffff:7f00:1 — expand and read the last 32 bits.
  const m = lower.match(/^::(?:ffff:(?:0:)?)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (m) {
    const hi = parseInt(m[1], 16);
    const lo = parseInt(m[2], 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return null;
}

/** True only for an ordinary public unicast address. Anything that is not a
 * syntactically valid IP returns false. */
export function isPublicIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 0) return false;

  if (family === 4) return !blocked.check(ip, "ipv4");

  // IPv6: refuse the block list outright, and independently refuse any v6
  // address whose embedded IPv4 is itself non-public.
  if (blocked.check(ip, "ipv6")) return false;
  const v4 = embeddedIPv4(ip);
  if (v4 && isIP(v4) === 4 && blocked.check(v4, "ipv4")) return false;
  return true;
}
