export const dynamic = "force-dynamic";

export default function DynamicPage() {
  const now = new Date().toISOString();
  return (
    <div>
      <h1>Dynamic Page</h1>
      <p>This page is server-rendered on every request.</p>
      <p>Current time: <strong>{now}</strong></p>
      <p>Refresh to see the timestamp change.</p>
      <p><a href="/">Back to home</a></p>
    </div>
  );
}
