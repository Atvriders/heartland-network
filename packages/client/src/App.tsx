/** Main game screen composition. */
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { GameStore, StoreProvider, useSnapshot, useStore } from "./game/store.js";
import { MapView } from "./map/MapView.js";
import { Hud } from "./ui/Hud.js";
import { Toolbar, BuildPreviewCard } from "./ui/toolbar.js";
import { Inspector } from "./ui/inspector.js";
import { PanelHost } from "./ui/PanelHost.js";
import { Overlays } from "./ui/components.js";
import { GamePicker } from "./GamePicker.js";

function KeyboardShortcuts(): null {
  const store = useStore();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA")
      )
        return;
      if (e.key === " ") {
        e.preventDefault();
        const s = store.getSnapshot().state;
        if (s) void store.send({ cmd: "setPaused", paused: !s.meta.paused });
      } else if (e.key === "1" || e.key === "2" || e.key === "3" || e.key === "4") {
        const speeds = [1, 2, 5, 15];
        void store.send({ cmd: "setPaused", paused: false });
        void store.send({ cmd: "setSpeed", speed: speeds[Number(e.key) - 1]! });
      } else if (e.key === "Escape") {
        store.setTool("select");
        store.setBuildSource(null);
        store.setBuildPreview(null);
      } else if (e.key === "+" || e.key === "=") {
        store.zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1.25);
      } else if (e.key === "-") {
        store.zoomAt(window.innerWidth / 2, window.innerHeight / 2, 0.8);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);
  return null;
}

function GameScreen({ gameId }: { gameId: string }): ReactNode {
  const [store] = useState(() => new GameStore(gameId));
  return (
    <StoreProvider store={store}>
      <KeyboardShortcuts />
      <Hud />
      <MapView />
      <Toolbar />
      <Inspector />
      <PanelHost />
      <BuildPreviewCard />
      <Legend />
      <EventFeed />
      <Overlays />
      <MobilePanels />
    </StoreProvider>
  );
}

function Legend(): ReactNode {
  const snap = useSnapshot();
  if (snap.state === null) return null;
  return (
    <div className="legend">
      <div className="li">
        <span className="sw" style={{ background: "#37d67a" }} /> Healthy
      </div>
      <div className="li">
        <span className="sw" style={{ background: "#f2b84b" }} /> Building / battery
      </div>
      <div className="li">
        <span className="sw" style={{ background: "#ff5f66" }} /> Failed / storm
      </div>
      <div className="li">
        <span className="sw" style={{ background: "#b58cff" }} /> Unpowered
      </div>
      <div className="li">
        <span className="sw" style={{ background: "#8a97ad" }} /> Offline
      </div>
      <div className="li">
        <span className="sw" style={{ background: "#35d0bd", height: 3 }} /> Fiber
      </div>
      <div className="li">
        <span className="sw" style={{ height: 3, border: "1px dashed #f2b84b", background: "transparent" }} />{" "}
        Microwave
      </div>
    </div>
  );
}

function EventFeed(): ReactNode {
  const snap = useSnapshot();
  if (snap.feed.length === 0) return null;
  return (
    <div className="feed" data-testid="event-feed">
      {snap.feed.slice(0, 12).map((e) => (
        <div key={e.id} className="entry">
          <span className="d num">D{e.day}</span>
          <span
            style={{
              color:
                e.severity === "critical"
                  ? "#ff9aa0"
                  : e.severity === "warning"
                    ? "#ffd894"
                    : "var(--text-1)",
            }}
          >
            {e.message}
          </span>
        </div>
      ))}
    </div>
  );
}

/** On small screens, surface panel buttons in a bottom bar. */
function MobilePanels(): ReactNode {
  const snap = useSnapshot();
  const store = useStore();
  return (
    <div className="mobile-panel-bar">
      {(
        [
          ["finance", "Finances"],
          ["customers", "Customers"],
          ["network", "Network"],
          ["research", "Research"],
          ["incidents", "Incidents"],
          ["admin", "Admin"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          data-testid={`mobile-panel-${id}`}
          className={`btn small ${snap.panel === id ? "primary" : ""}`}
          onClick={() => store.setPanel(snap.panel === id ? null : id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function App(): ReactNode {
  const [gameId, setGameId] = useState<string | null>(() => {
    const params = new URLSearchParams(location.search);
    const fromUrl = params.get("game");
    if (fromUrl) return fromUrl;
    return localStorage.getItem("heartland.lastGame");
  });

  if (!gameId) {
    return (
      <GamePicker
        onPlay={(id) => {
          localStorage.setItem("heartland.lastGame", id);
          setGameId(id);
        }}
      />
    );
  }
  return <GameScreen key={gameId} gameId={gameId} />;
}
