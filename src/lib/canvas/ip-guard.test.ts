import { describe, it, expect } from "vitest";
import { isPublicIp } from "./ip-guard";

describe("isPublicIp — refuses addresses the server must never reach", () => {
  it.each([
    ["loopback", "127.0.0.1"],
    ["loopback range", "127.255.255.254"],
    ["this-network", "0.0.0.0"],
    ["private 10/8", "10.0.0.5"],
    ["private 172.16/12 low", "172.16.0.1"],
    ["private 172.16/12 high", "172.31.255.255"],
    ["private 192.168/16", "192.168.1.1"],
    ["cloud metadata (AWS/GCP/Azure)", "169.254.169.254"],
    ["link-local", "169.254.0.1"],
    ["carrier-grade NAT", "100.64.0.1"],
    ["benchmarking", "198.18.0.1"],
    ["documentation", "203.0.113.9"],
    ["multicast", "224.0.0.1"],
    ["reserved", "240.0.0.1"],
    ["broadcast", "255.255.255.255"],
  ])("blocks IPv4 %s (%s)", (_label, ip) => {
    expect(isPublicIp(ip)).toBe(false);
  });

  it.each([
    ["loopback", "::1"],
    ["unspecified", "::"],
    ["unique local", "fd00::1"],
    ["unique local fc", "fc00::1"],
    ["link-local", "fe80::1"],
    ["multicast", "ff02::1"],
    ["documentation", "2001:db8::1"],
    ["Teredo", "2001:0:4136:e378:8000:63bf:3fff:fdd2"],
    ["IPv4-mapped loopback", "::ffff:127.0.0.1"],
    ["IPv4-mapped loopback (hex)", "::ffff:7f00:1"],
    ["IPv4-mapped metadata", "::ffff:169.254.169.254"],
    ["IPv4-mapped private", "::ffff:10.1.2.3"],
    ["NAT64 of loopback", "64:ff9b::7f00:1"],
    ["6to4", "2002:7f00:1::1"],
  ])("blocks IPv6 %s (%s)", (_label, ip) => {
    expect(isPublicIp(ip)).toBe(false);
  });

  it.each([
    ["8.8.8.8"],
    ["1.1.1.1"],
    ["104.16.0.1"],
    ["172.15.255.255"], // just below 172.16/12
    ["172.32.0.0"], // just above 172.16/12
    ["100.63.255.255"], // just below CGNAT
    ["100.128.0.1"], // just above CGNAT
    ["2606:4700:4700::1111"],
    ["2a00:1450:4001:81a::200e"],
    ["::ffff:8.8.8.8"], // mapped but public
  ])("allows public address %s", (ip) => {
    expect(isPublicIp(ip)).toBe(true);
  });

  it("rejects anything that isn't a valid IP", () => {
    for (const bad of ["", "localhost", "example.com", "999.1.1.1", "1.2.3", "0x7f.0.0.1", "2130706433"]) {
      expect(isPublicIp(bad)).toBe(false);
    }
  });
});
