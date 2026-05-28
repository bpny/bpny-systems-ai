import { rewrite, next } from '@vercel/edge';

// Edge A/B test: split homepage traffic 50/50 between the two designs.
//   variant "a" -> index.html  (original)
//   variant "b" -> index-b.html ("Buffalo Built" redesign)
// Only runs on "/", so /index.html and /index-b.html stay directly reachable.
export const config = {
  matcher: '/',
};

const COOKIE = 'bpny-ab';
const THIRTY_DAYS = 60 * 60 * 24 * 30;

export default function middleware(request: Request) {
  const cookies = request.headers.get('cookie') ?? '';
  const assigned = cookies.match(/(?:^|;\s*)bpny-ab=(a|b)\b/)?.[1];

  // Sticky: reuse the visitor's existing bucket, otherwise flip a coin.
  const variant = assigned ?? (Math.random() < 0.5 ? 'a' : 'b');

  const response =
    variant === 'b' ? rewrite(new URL('/index-b.html', request.url)) : next();

  // Only set the cookie for newly bucketed visitors so we don't reset the window.
  if (!assigned) {
    response.headers.append(
      'set-cookie',
      `${COOKIE}=${variant}; Path=/; Max-Age=${THIRTY_DAYS}; SameSite=Lax`,
    );
  }

  // Readable by analytics: cookie is not HttpOnly, so document.cookie has it,
  // and this header is handy for server-side logs / debugging.
  response.headers.set('x-bpny-variant', variant);

  return response;
}
