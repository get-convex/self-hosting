export default function Home() {
  return (
    <div>
      <h1>Next.js on Convex</h1>
      <p>This is a statically rendered page served from Convex.</p>
      <nav>
        <ul>
          <li><a href="/dynamic">Dynamic page (SSR)</a></li>
          <li><a href="/api/hello">API route</a></li>
        </ul>
      </nav>
    </div>
  );
}
