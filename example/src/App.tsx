import { useState } from "react";
import { UpdateBanner } from "@convex-dev/self-hosting/react";
import { api } from "../convex/_generated/api";
import "./App.css";

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="app">
      {/* Shows a banner when a new deployment is available */}
      <UpdateBanner
        getCurrentDeployment={api.example.getCurrentDeployment}
        message="🚀 New version deployed!"
        buttonText="Refresh"
      />

      <header className="header">
        <h1>🚀 Convex Static Hosting</h1>
        <p className="subtitle">Self-hosted React app on Convex</p>
      </header>

      <main className="main">
        <div className="card">
          <h2>It works!</h2>
          <p>
            This React app is being served directly from Convex HTTP actions and
            file storage. No external hosting required!
          </p>

          <div className="counter">
            <button onClick={() => setCount((c) => c - 1)}>−</button>
            <span className="count">{count}</span>
            <button onClick={() => setCount((c) => c + 1)}>+</button>
          </div>
        </div>

        <div className="features">
          <div className="feature">
            <span className="icon">📦</span>
            <h3>Simple Upload</h3>
            <p>
              Run <code>npm run deploy:static</code> to upload your built files
              to Convex storage
            </p>
          </div>

          <div className="feature">
            <span className="icon">🔄</span>
            <h3>Live Reload</h3>
            <p>
              Connected clients are notified when you deploy - with a prompt to
              reload
            </p>
          </div>

          <div className="feature">
            <span className="icon">⚡</span>
            <h3>Smart Caching</h3>
            <p>
              Hashed assets get long-term caching, while HTML is always fresh
            </p>
          </div>
        </div>

        <div className="card">
          <h3>How it works</h3>
          <ol>
            <li>Build your app with Vite or your bundler of choice</li>
            <li>Upload the dist/ folder using the provided script</li>
            <li>
              Access your app at <code>your-deployment.convex.site</code>
            </li>
          </ol>
        </div>
      </main>

      <footer className="footer">
        <p>
          Built with{" "}
          <a href="https://convex.dev" target="_blank" rel="noopener noreferrer">
            Convex
          </a>{" "}
          +{" "}
          <a href="https://react.dev" target="_blank" rel="noopener noreferrer">
            React
          </a>
        </p>
      </footer>
    </div>
  );
}

export default App;
