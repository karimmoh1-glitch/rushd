import { BlockList, isIP } from "node:net";

// Decides whether the server may connect to an IP address for a student.
// Security: students control the Canvas hostname, so without this check a
// hostname could point at localhost, our private network, or cloud metadata
// (169.254.169.254). Only normal public addresses are allowed, and IPv4
// hidden inside IPv6 (::ffff:127.0.0.1, NAT64, 6to4, Teredo) is checked too.

const blocked = new BlockList();

const BLOCKED_IPV4_RANGES: [string, number][] = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, including cloud metadata 169.254.169.254
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

const BLOCKED_IPV6_RANGES: [string, number][] = [
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

for (const [network, prefix] of BLOCKED_IPV4_RANGES) {
  blocked.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of BLOCKED_IPV6_RANGES) {
  blocked.addSubnet(network, prefix, "ipv6");
}

/** Finds an IPv4 address hidden inside an IPv6 address, like ::ffff:1.2.3.4
 * or ::ffff:7f00:1. Returns null when there isn't one. */
function embeddedIPv4(ip: string): string | null {
  const lower = ip.toLowerCase();

  // Dotted form, e.g. ::ffff:127.0.0.1
  const dottedMatch = lower.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dottedMatch && lower.includes(":")) {
    return dottedMatch[1];
  }

  // Hex form, e.g. ::ffff:7f00:1 — the last two groups are the 32 IPv4 bits.
  const hexMatch = lower.match(/^::(?:ffff:(?:0:)?)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMatch) {
    const high = parseInt(hexMatch[1], 16);
    const low = parseInt(hexMatch[2], 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }

  return null;
}

/** True only for an ordinary public address. Anything that isn't a valid IP
 * returns false. */
export function isPublicIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 0) {
    return false;
  }

  if (family === 4) {
    return !blocked.check(ip, "ipv4");
  }

  // IPv6: refuse blocked ranges, and also refuse it if the IPv4 hidden inside is blocked.
  if (blocked.check(ip, "ipv6")) {
    return false;
  }
  const hiddenIPv4 = embeddedIPv4(ip);
  if (hiddenIPv4 && isIP(hiddenIPv4) === 4 && blocked.check(hiddenIPv4, "ipv4")) {
    return false;
  }
  return true;
}
