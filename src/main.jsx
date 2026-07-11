import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

class DashboardErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Dashboard startup error", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="startup-error" role="alert">
        <div>
          <p>National Tracer Drug Availability</p>
          <h1>The dashboard could not load</h1>
          <p>Please refresh the page. If the problem continues, report the selected reporting period to the dashboard administrator.</p>
          <button type="button" onClick={() => window.location.reload()}>Refresh dashboard</button>
        </div>
      </main>
    );
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <DashboardErrorBoundary>
      <App />
    </DashboardErrorBoundary>
  </React.StrictMode>
);
