"use client";

import { useEffect, useState } from "react";

type AlertRule = {
  id: string;
  type: "SPOT_ABOVE" | "SPOT_BELOW" | "FORWARD_ABOVE" | "FORWARD_BELOW";
  level: number;
  message: string;
  enabled: boolean;
  channel: "EMAIL" | "WHATSAPP" | "BOTH";
  lastTriggered?: string;
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertRule[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newAlert, setNewAlert] = useState({
    type: "SPOT_ABOVE" as AlertRule["type"],
    level: "",
    message: "",
    channel: "EMAIL" as AlertRule["channel"],
  });
  const [spot, setSpot] = useState(0);

  useEffect(() => {
    Promise.all([
      fetch("/api/alerts").then((r) => r.json()),
      fetch("/api/fx").then((r) => r.json()),
    ]).then(([ad, fd]) => {
      setAlerts(ad.alerts || []);
      setSpot(fd.fx?.spot || 86.20);
    });
  }, []);

  async function addAlert() {
    const res = await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add",
        ...newAlert,
        level: Number(newAlert.level),
      }),
    });
    const d = await res.json();
    if (d.alert) {
      setAlerts([...alerts, d.alert]);
      setShowAdd(false);
      setNewAlert({
        type: "SPOT_ABOVE",
        level: "",
        message: "",
        channel: "EMAIL",
      });
    }
  }

  async function toggleAlert(id: string) {
    await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle", id }),
    });
    setAlerts(
      alerts.map((a) =>
        a.id === id ? { ...a, enabled: !a.enabled } : a
      )
    );
  }

  async function deleteAlert(id: string) {
    await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    setAlerts(alerts.filter((a) => a.id !== id));
  }

  const typeLabels: Record<string, string> = {
    SPOT_ABOVE: "Spot Above",
    SPOT_BELOW: "Spot Below",
    FORWARD_ABOVE: "Forward Above",
    FORWARD_BELOW: "Forward Below",
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Alerts</h1>
          <p className="text-sm text-slate-400 mt-1">
            Configure triggers &middot; Current spot: {spot.toFixed(4)}
          </p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-primary">
          {showAdd ? "Cancel" : "New Alert"}
        </button>
      </div>

      {/* Add alert form */}
      {showAdd && (
        <div className="card space-y-4">
          <h3 className="text-sm font-semibold text-slate-300">
            Create New Alert
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Type</label>
              <select
                className="select-field w-full"
                value={newAlert.type}
                onChange={(e) =>
                  setNewAlert({
                    ...newAlert,
                    type: e.target.value as AlertRule["type"],
                  })
                }
              >
                <option value="SPOT_ABOVE">Spot Above</option>
                <option value="SPOT_BELOW">Spot Below</option>
                <option value="FORWARD_ABOVE">Forward Above</option>
                <option value="FORWARD_BELOW">Forward Below</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Trigger Level
              </label>
              <input
                className="input-field"
                type="number"
                step="0.01"
                placeholder="e.g. 87.00"
                value={newAlert.level}
                onChange={(e) =>
                  setNewAlert({ ...newAlert, level: e.target.value })
                }
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Channel
              </label>
              <select
                className="select-field w-full"
                value={newAlert.channel}
                onChange={(e) =>
                  setNewAlert({
                    ...newAlert,
                    channel: e.target.value as AlertRule["channel"],
                  })
                }
              >
                <option value="EMAIL">Email</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="BOTH">Both</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Message
              </label>
              <input
                className="input-field"
                placeholder="Alert message..."
                value={newAlert.message}
                onChange={(e) =>
                  setNewAlert({ ...newAlert, message: e.target.value })
                }
              />
            </div>
          </div>
          <button onClick={addAlert} className="btn-success">
            Create Alert
          </button>
        </div>
      )}

      {/* Alert rules list */}
      <div className="space-y-3">
        {alerts.length === 0 && (
          <div className="card text-center text-slate-500 py-12">
            No alerts configured. Click &quot;New Alert&quot; to create one.
          </div>
        )}
        {alerts.map((alert) => {
          const isTriggered =
            (alert.type === "SPOT_ABOVE" && spot >= alert.level) ||
            (alert.type === "SPOT_BELOW" && spot <= alert.level);
          return (
            <div
              key={alert.id}
              className={`card flex items-center justify-between ${
                !alert.enabled ? "opacity-50" : ""
              } ${isTriggered ? "border-amber-500/50" : ""}`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-3 h-3 rounded-full ${
                    isTriggered
                      ? "bg-amber-400 animate-pulse"
                      : alert.enabled
                      ? "bg-green-400"
                      : "bg-slate-600"
                  }`}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-200">
                      {typeLabels[alert.type]}
                    </span>
                    <span className="font-mono text-lg text-amber-400">
                      {alert.level.toFixed(2)}
                    </span>
                    <span
                      className={`badge ${
                        alert.channel === "EMAIL"
                          ? "badge-blue"
                          : alert.channel === "WHATSAPP"
                          ? "badge-green"
                          : "badge-amber"
                      }`}
                    >
                      {alert.channel}
                    </span>
                    {isTriggered && (
                      <span className="badge-amber">TRIGGERED</span>
                    )}
                  </div>
                  {alert.message && (
                    <p className="text-xs text-slate-400 mt-1">
                      {alert.message}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleAlert(alert.id)}
                  className="btn-secondary text-xs"
                >
                  {alert.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  onClick={() => deleteAlert(alert.id)}
                  className="btn-danger text-xs"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Info panel */}
      <div className="card bg-blue-600/5 border-blue-500/20">
        <h3 className="text-sm font-semibold text-blue-400 mb-2">
          How Alerts Work
        </h3>
        <ul className="text-xs text-slate-400 space-y-1">
          <li>
            Alerts trigger when the current spot rate crosses the configured
            level.
          </li>
          <li>
            Email alerts use SendGrid (configure SENDGRID_API_KEY in .env).
          </li>
          <li>
            WhatsApp alerts use Twilio (configure TWILIO_* keys in .env).
          </li>
          <li>
            In production, set up a cron job to hit /api/alerts/check every 5
            minutes.
          </li>
        </ul>
      </div>
    </div>
  );
}
