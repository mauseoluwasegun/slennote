import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConvexReactClient } from "convex/react";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import App from "./App";
import { ThemeProvider } from "./context/ThemeContext";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function MissingKeyPage() {
  // Simple inline styles to avoid depending on app CSS when showing the error page
  const boxStyle: React.CSSProperties = {
    fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
    padding: 24,
    maxWidth: 760,
    margin: '48px auto',
    background: 'white',
    color: '#111827',
    borderRadius: 8,
    boxShadow: '0 6px 24px rgba(16,24,40,0.08)'
  };
  const codeStyle: React.CSSProperties = {
    display: 'block',
    background: '#0f172a',
    color: '#f8fafc',
    padding: '12px 16px',
    borderRadius: 6,
    marginTop: 12,
    overflowX: 'auto'
  };

  return (
    <div style={{padding: 16}}>
      <div style={boxStyle}>
        <h1 style={{marginTop: 0}}>Missing Clerk Publishable Key</h1>
        <p>
          This app requires a Clerk publishable key to initialize client-side
          authentication. The development build could not find the environment
          variable <code>VITE_CLERK_PUBLISHABLE_KEY</code>.
        </p>
        <p>To fix this locally, create a <code>.env</code> file at the project root with:</p>
        <pre style={codeStyle}>VITE_CLERK_PUBLISHABLE_KEY=&lt;your_clerk_publishable_key&gt;</pre>
        <p>
          After adding the variable, restart your dev server (Vite) so the
          value is picked up. For more info see the Clerk docs: {' '}
          <a href="https://clerk.com/docs" target="_blank" rel="noopener noreferrer">https://clerk.com/docs</a>
        </p>
        <p style={{marginTop: 12, fontSize: 13, color: '#6b7280'}}>
          Note: env vars available to the browser must be prefixed with <code>VITE_</code>.
        </p>
      </div>
    </div>
  );
}

if (!PUBLISHABLE_KEY) {
  // Log a clear error in the console for devs while rendering a helpful page
  // instead of throwing an uncaught exception that breaks the whole bundle.
  // This keeps the dev server running and points the developer to the fix.
  // eslint-disable-next-line no-console
  console.error('Missing Clerk Publishable Key. Set VITE_CLERK_PUBLISHABLE_KEY in your .env and restart the dev server.');

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <MissingKeyPage />
    </StrictMode>,
  );

} else {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <BrowserRouter>
        <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
          <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
            <ThemeProvider>
              <App />
            </ThemeProvider>
          </ConvexProviderWithClerk>
        </ClerkProvider>
      </BrowserRouter>
    </StrictMode>,
  );
}
