import { BlockList, isIP } from 'node:net';

/** Address ranges that are not the public Internet, with what they are. */
const RANGES: Array<{ network: string; prefix: number; family: 'ipv4' | 'ipv6'; kind: string }> = [
  { network: '0.0.0.0', prefix: 8, family: 'ipv4', kind: 'unspecified ("this network")' },
  { network: '10.0.0.0', prefix: 8, family: 'ipv4', kind: 'private' },
  { network: '100.64.0.0', prefix: 10, family: 'ipv4', kind: 'shared (carrier-grade NAT)' },
  { network: '127.0.0.0', prefix: 8, family: 'ipv4', kind: 'loopback' },
  { network: '169.254.0.0', prefix: 16, family: 'ipv4', kind: 'link-local (cloud metadata)' },
  { network: '172.16.0.0', prefix: 12, family: 'ipv4', kind: 'private' },
  { network: '192.0.0.0', prefix: 24, family: 'ipv4', kind: 'IETF protocol assignments' },
  { network: '192.0.2.0', prefix: 24, family: 'ipv4', kind: 'documentation' },
  { network: '192.88.99.0', prefix: 24, family: 'ipv4', kind: '6to4 relay' },
  { network: '192.168.0.0', prefix: 16, family: 'ipv4', kind: 'private' },
  { network: '198.18.0.0', prefix: 15, family: 'ipv4', kind: 'benchmarking' },
  { network: '198.51.100.0', prefix: 24, family: 'ipv4', kind: 'documentation' },
  { network: '203.0.113.0', prefix: 24, family: 'ipv4', kind: 'documentation' },
  { network: '224.0.0.0', prefix: 4, family: 'ipv4', kind: 'multicast' },
  { network: '240.0.0.0', prefix: 4, family: 'ipv4', kind: 'reserved or broadcast' },
  { network: '::', prefix: 128, family: 'ipv6', kind: 'unspecified' },
  { network: '::1', prefix: 128, family: 'ipv6', kind: 'loopback' },
  { network: '64:ff9b:1::', prefix: 48, family: 'ipv6', kind: 'local NAT64' },
  { network: '100::', prefix: 64, family: 'ipv6', kind: 'discard' },
  { network: '2001::', prefix: 23, family: 'ipv6', kind: 'IETF protocol assignments (Teredo…)' },
  { network: '2001:db8::', prefix: 32, family: 'ipv6', kind: 'documentation' },
  { network: 'fc00::', prefix: 7, family: 'ipv6', kind: 'unique local (private)' },
  { network: 'fe80::', prefix: 10, family: 'ipv6', kind: 'link-local' },
  { network: 'fec0::', prefix: 10, family: 'ipv6', kind: 'site-local' },
  { network: 'ff00::', prefix: 8, family: 'ipv6', kind: 'multicast' },
];

const LISTS = RANGES.map((range) => {
  const list = new BlockList();
  list.addSubnet(range.network, range.prefix, range.family);
  return { list, family: range.family, kind: range.kind };
});

/**
 * What kind of non-public address this is (`loopback`, `private`, `link-local (cloud
 * metadata)`…), or undefined for a public one. IPv6 addresses that carry an IPv4 address —
 * IPv4-mapped (`::ffff:127.0.0.1`), IPv4-compatible, NAT64 (`64:ff9b::/96`) and 6to4
 * (`2002::/16`) — are judged by that IPv4 address too.
 */
export function nonPublicKind(address: string): string | undefined {
  const bare = (address.replace(/^\[|\]$/g, '').split('%')[0] ?? '').trim();
  const version = isIP(bare);
  if (version === 4) return kindOf(bare, 'ipv4');
  if (version !== 6) return 'not an IP address';
  const groups = ipv6Groups(bare);
  if (!groups) return 'not an IP address';
  const embedded = embeddedIpv4(groups);
  if (embedded) {
    const kind = kindOf(embedded, 'ipv4');
    if (kind) return `${kind}, as ${embedded} inside an IPv6 address`;
  }
  return kindOf(bare, 'ipv6');
}

/** An address of the public Internet. */
export function isPublicAddress(address: string): boolean {
  return nonPublicKind(address) === undefined;
}

function kindOf(address: string, family: 'ipv4' | 'ipv6'): string | undefined {
  return LISTS.find((entry) => entry.family === family && entry.list.check(address, family))?.kind;
}

/** The eight 16-bit groups of an IPv6 address (dotted IPv4 tails included). */
function ipv6Groups(address: string): number[] | undefined {
  let canonical: string;
  try {
    // The URL parser writes any IPv6 form canonically, dotted tails as hex groups.
    canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  } catch {
    return undefined;
  }
  const [head = '', tail] = canonical.split('::');
  const before = head ? head.split(':') : [];
  const after = tail ? tail.split(':') : [];
  const zeros = tail === undefined ? [] : Array<string>(8 - before.length - after.length).fill('0');
  const groups = [...before, ...zeros, ...after].map((group) => Number.parseInt(group, 16));
  return groups.length === 8 && groups.every((group) => Number.isInteger(group))
    ? groups
    : undefined;
}

/** The IPv4 address an IPv6 address carries, if it is of a kind that carries one. */
function embeddedIpv4(groups: number[]): string | undefined {
  const [g0, g1, g2, g3, g4, g5, g6 = 0, g7 = 0] = groups;
  const v4 = (high: number, low: number) => `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  const zeroUpTo = (count: number) => groups.slice(0, count).every((group) => group === 0);
  // ::ffff:a.b.c.d (mapped)
  if (zeroUpTo(5) && g5 === 0xffff) return v4(g6, g7);
  // ::a.b.c.d (compatible, deprecated), but not :: and ::1
  if (zeroUpTo(6) && (g6 !== 0 || g7 > 1)) return v4(g6, g7);
  // 64:ff9b::a.b.c.d (NAT64)
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return v4(g6, g7);
  }
  // 2002:aabb:ccdd::/48 (6to4)
  if (g0 === 0x2002) return v4(g1 ?? 0, g2 ?? 0);
  return undefined;
}
