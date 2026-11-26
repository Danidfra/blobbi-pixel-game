// PX-S2: the production page carries ONE content security policy, sent twice. The <meta> in index.html (`CSP`,
// vite.config.ts) is the fallback for a host that sends no headers; Vercel sends the very same policy as an HTTP
// header (vercel.json), plus `frame-ancestors 'none'`, which a <meta> cannot carry. The header applies from the first
// byte, before the parser reaches the <meta>. Two copies by hand would drift (a relay added to one and not the other
// breaks the relays in production only, or leaves the header looser than the page): this keeps them equal.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CSP } from '../vite.config';
import { PIXEL_TRAVEL_RELAYS } from '../src/nostr/world-travel';
import { PUBLISH_RELAYS, READ_RELAYS } from '../src/nostr/relay-config';

interface VercelHeaders {
  headers: { source: string; headers: { key: string; value: string }[] }[];
}
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as VercelHeaders;
const cspHeaders = vercel.headers.flatMap((rule) => rule.headers.filter((h) => h.key.toLowerCase() === 'content-security-policy').map((h) => ({ source: rule.source, value: h.value })));
const directives = (policy: string) => policy.split(';').map((d) => d.trim()).filter(Boolean);

describe('PX-S2: the CSP header served by Vercel is the build\'s CSP, plus frame-ancestors', () => {
  it('exactly one CSP header, for every path', () => {
    expect(cspHeaders.map((h) => h.source)).toEqual(['/(.*)']);
  });

  it('the header is the <meta> policy, directive for directive, and frame-ancestors \'none\'', () => {
    expect(cspHeaders[0].value).toBe(`${CSP}; frame-ancestors 'none'`);
    expect(directives(cspHeaders[0].value)).toEqual([...directives(CSP), "frame-ancestors 'none'"]);
  });

  it('the <meta> policy keeps out what a <meta> cannot carry', () => {
    for (const name of ['frame-ancestors', 'report-uri', 'report-to', 'sandbox']) expect(directives(CSP).some((d) => d.split(' ')[0] === name), name).toBe(false);
  });

  it('clickjacking stays closed for browsers without CSP 2 (X-Frame-Options DENY)', () => {
    const all = vercel.headers.find((r) => r.source === '/(.*)')!.headers;
    expect(all.find((h) => h.key === 'X-Frame-Options')?.value).toBe('DENY');
  });
});

// PX-Q5: the World-Travel relays come from a kit constant (`BLOBBI_WORLD_TRAVEL_RELAYS`), not from relay-config.ts.
// A kit bump that adds a travel relay would be blocked by the CSP in production only (the dev server has no CSP).
describe('PX-Q5: every relay the page talks to fits the CSP connect-src', () => {
  const connect = (policy: string) => directives(policy).find((d) => d.startsWith('connect-src '))!.split(' ').slice(1);

  it('the World-Travel relays (the primary plus the kit\'s) are allowed by the <meta> and by the header', () => {
    expect(PIXEL_TRAVEL_RELAYS.length).toBeGreaterThan(0);
    for (const policy of [CSP, cspHeaders[0].value]) for (const url of PIXEL_TRAVEL_RELAYS) expect(connect(policy), url).toContain(url);
  });

  it('so are the publish and read relays', () => {
    for (const policy of [CSP, cspHeaders[0].value]) for (const url of [...PUBLISH_RELAYS, ...READ_RELAYS]) expect(connect(policy), url).toContain(url);
  });
});
