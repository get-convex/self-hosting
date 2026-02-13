export const metadata = {
  title: "Next.js on Convex",
  description: "Next.js app hosted on Convex via self-hosting component",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 640, margin: "40px auto", padding: "0 20px" }}>
        {children}
      </body>
    </html>
  );
}
