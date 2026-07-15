import React, { useState, useEffect, useRef } from "react";
import Papa from "papaparse";
import {
  Plus, X, Users, ClipboardPaste, CheckSquare, Square, Trash2,
  ChevronLeft, ChevronDown, ChevronRight, LayoutGrid, ListChecks, Building2,
  AlertCircle, Hammer, CalendarDays, Loader2, StickyNote, Layers
} from "lucide-react";
import { supabase, TEAM_ROOM_ID } from "./supabaseClient";

// ---------- helpers ----------
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const STORAGE_KEY = "ap_projects_v2";

const emptyAction = () => ({
  id: genId(), text: "", memo: "", isTodo: false, done: false, due: "",
});
const emptyIssue = () => ({
  id: genId(), text: "", memo: "", actions: [emptyAction()],
});
const emptyOtherTodo = () => ({
  id: genId(), text: "", memo: "", done: false, due: "",
});
const emptyChannel = (name = "新しいチャネル") => ({
  id: genId(), name, owner: "",
  metricsHeaders: [], metricsRows: [], metricsUpdatedAt: null,
  issues: [emptyIssue()],
  otherTodos: [],
});
const emptyProject = (name = "新規案件") => ({
  id: genId(), name, client: "", owner: "", createdAt: Date.now(),
  channels: [emptyChannel("Meta"), emptyChannel("Google検索")],
});

function cloneAndUpdate(prev, fn) {
  const next = JSON.parse(JSON.stringify(prev));
  fn(next);
  return next;
}

// migrate from the old flat "cards" schema (v1) so existing saved data doesn't crash
function migrateProject(p) {
  if (!p.channels) p.channels = [];
  p.channels.forEach((c) => {
    if (!c.otherTodos) c.otherTodos = [];
    if (c.issues) return; // already v2
    const oldCards = c.cards || [];
    const issues = oldCards.filter((cd) => cd.type === "issue").map((cd) => ({
      id: cd.id, text: cd.text || "", memo: "", actions: [],
    }));
    const orphanActions = oldCards.filter((cd) => cd.type === "action").map((cd) => ({
      id: cd.id, text: cd.text || "", memo: "",
      isTodo: !!cd.isTodo, done: !!cd.done, due: cd.due || "",
    }));
    if (orphanActions.length) {
      issues.push({ id: genId(), text: "(旧データ)", memo: "", actions: orphanActions });
    }
    c.issues = issues.length ? issues : [emptyIssue()];
    delete c.cards;
  });
  return p;
}

// ---------- design tokens (Apple / Threads-inspired surface) ----------
const COLORS = {
  bg: "#F5F5F7",
  panel: "#FFFFFF",
  ink: "#1D1D1F",
  ink2: "#1D1D1F",
  sub: "#86868B",
  hair: "rgba(0,0,0,0.07)",
  hairStrong: "rgba(0,0,0,0.12)",
  accent: "#0071E3",
  accentSoft: "rgba(0,113,227,0.10)",
  issue: "#D9463A",
  issueSoft: "#FBECEA",
  action: "#0A7AFF",
  actionSoft: "#EBF3FF",
  todo: "#B4790A",
  todoSoft: "#FBF1DE",
};
// backwards-compatible alias used in a few older spots
COLORS.line = COLORS.hair;
COLORS.success = "#2FA84F";
COLORS.successSoft = "#E6F6EA";

// a friendly, varied palette so each channel gets a bit of personality
const CHANNEL_PALETTE = [
  { bg: "#FFEAEA", fg: "#DD5A4E" }, // coral
  { bg: "#FFF3DC", fg: "#C98A16" }, // amber
  { bg: "#E7F8EC", fg: "#2AA35A" }, // mint
  { bg: "#E7F1FF", fg: "#2E7BD6" }, // sky
  { bg: "#F3EBFF", fg: "#8A5BC7" }, // lavender
  { bg: "#FFEAF4", fg: "#D6488F" }, // rose
  { bg: "#EAF6F6", fg: "#1F9490" }, // teal
];
function channelColor(name) {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CHANNEL_PALETTE[h % CHANNEL_PALETTE.length];
}

// small ring that visualizes todo completion — a bit of positive, game-like feedback
function ProgressRing({ percent, size = 34, label }) {
  const pct = Math.max(0, Math.min(1, percent));
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }} title={label}>
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: `conic-gradient(${COLORS.success} ${pct * 360}deg, rgba(0,0,0,0.07) 0deg)`,
      }} />
      <div style={{
        position: "absolute", inset: 4, borderRadius: "50%", background: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size > 30 ? 10 : 9, fontWeight: 700, color: COLORS.success,
      }}>
        {Math.round(pct * 100)}%
      </div>
    </div>
  );
}

const globalCss = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
* { box-sizing: border-box; }
body { margin: 0; }
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 4px; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
input, textarea, button {
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', 'Segoe UI', Helvetica, Arial, sans-serif;
}
button { cursor: pointer; transition: background .15s ease, opacity .15s ease, transform .1s ease; }
button:active { transform: scale(0.98); }
.card-hover { transition: box-shadow .2s ease, transform .2s ease; }
.card-hover:hover { box-shadow: 0 12px 32px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.04); transform: translateY(-2px); }
.icon-btn:hover { background: rgba(0,0,0,0.045) !important; }
.nav-item:hover { background: rgba(0,0,0,0.045); }
.pill-btn:hover { opacity: 0.86; }
.ghost-btn:hover { background: rgba(0,0,0,0.045); }
`;

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, 'SF Mono', 'IBM Plex Mono', Menlo, monospace";

const styles = {
  app: { display: "flex", minHeight: "100vh", background: COLORS.bg, color: COLORS.ink, fontFamily: FONT, fontSize: 14, letterSpacing: -0.1 },
  main: { flex: 1, padding: "36px 44px", overflowY: "auto", maxHeight: "100vh" },
};

// soft "elevated surface" card style shared across panels
const surfaceCard = (radius = 18) => ({
  background: COLORS.panel,
  border: `1px solid ${COLORS.hair}`,
  borderRadius: radius,
  boxShadow: "0 1px 2px rgba(0,0,0,0.03), 0 6px 18px rgba(0,0,0,0.035)",
});

const primaryBtn = {
  padding: "10px 20px", borderRadius: 999, border: "none",
  background: COLORS.ink, color: "#fff", fontWeight: 600, fontSize: 13.5,
};
const positiveBtn = {
  padding: "10px 20px", borderRadius: 999, border: "none",
  background: `linear-gradient(135deg, ${COLORS.success}, ${COLORS.accent})`,
  color: "#fff", fontWeight: 700, fontSize: 13.5,
  boxShadow: "0 4px 14px rgba(47,168,79,0.28)",
};
const ghostBtn = {
  padding: "10px 20px", borderRadius: 999, border: `1px solid ${COLORS.hair}`,
  background: "#fff", color: COLORS.ink, fontWeight: 600, fontSize: 13.5,
};
const iconBtnStyle = { border: `1px solid ${COLORS.hair}`, background: "#fff", borderRadius: 10, padding: 7 };

// ---------- root ----------
export default function AccountDashboard() {
  const [projects, setProjects] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("dashboard");
  const [selectedId, setSelectedId] = useState(null);
  const [saveState, setSaveState] = useState("idle");
  const skipNextSave = useRef(false);

  // load + subscribe: use Supabase when configured (team-shared, realtime),
  // otherwise fall back to this browser's localStorage (solo use / local dev)
  useEffect(() => {
    if (supabase) {
      let channel;
      (async () => {
        const { data, error } = await supabase
          .from("account_board")
          .select("data")
          .eq("id", TEAM_ROOM_ID)
          .maybeSingle();
        if (!error && data && data.data) {
          skipNextSave.current = true;
          setProjects(data.data.map(migrateProject));
        }
        setLoaded(true);

        channel = supabase
          .channel("account_board_" + TEAM_ROOM_ID)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "account_board", filter: `id=eq.${TEAM_ROOM_ID}` },
            (payload) => {
              const next = payload.new && payload.new.data;
              if (next) {
                skipNextSave.current = true;
                setProjects(next.map(migrateProject));
              }
            }
          )
          .subscribe();
      })();
      return () => { if (channel) supabase.removeChannel(channel); };
    }

    // local fallback
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setProjects(JSON.parse(raw).map(migrateProject));
    } catch (e) { /* no data yet */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (skipNextSave.current) { skipNextSave.current = false; return; }
    setSaveState("saving");
    const t = setTimeout(async () => {
      try {
        if (supabase) {
          const { error } = await supabase
            .from("account_board")
            .upsert({ id: TEAM_ROOM_ID, data: projects, updated_at: new Date().toISOString() });
          if (error) throw error;
        } else {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
        }
        setSaveState("saved");
      } catch (e) { console.error("save failed:", e); setSaveState("idle"); }
    }, 400);
    return () => clearTimeout(t);
  }, [projects, loaded]);

  const selected = projects.find((p) => p.id === selectedId) || null;

  const addProject = () => {
    const p = emptyProject();
    setProjects((prev) => [...prev, p]);
    setSelectedId(p.id);
    setView("project");
  };
  const deleteProject = (id) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (selectedId === id) { setSelectedId(null); setView("dashboard"); }
  };
  const updateProject = (id, fn) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? cloneAndUpdate(p, fn) : p)));
  };

  // flatten todos: action-based (tied to an issue) and channel-level "other" todos
  const allTodos = [];
  projects.forEach((p) =>
    p.channels.forEach((c) => {
      c.issues.forEach((iss) =>
        iss.actions.forEach((act) => {
          if (act.isTodo) {
            allTodos.push({
              ...act, kind: "action",
              projectId: p.id, projectName: p.name,
              channelId: c.id, channelName: c.name, channelOwner: c.owner,
              issueId: iss.id, issueText: iss.text,
            });
          }
        })
      );
      (c.otherTodos || []).forEach((t) => {
        allTodos.push({
          ...t, kind: "other",
          projectId: p.id, projectName: p.name,
          channelId: c.id, channelName: c.name, channelOwner: c.owner,
          issueId: null, issueText: null,
        });
      });
    })
  );
  const openTodoCount = allTodos.filter((t) => !t.done).length;

  if (!loaded) {
    return (
      <div style={{ ...styles.app, alignItems: "center", justifyContent: "center" }}>
        <Loader2 className="spin" size={22} color={COLORS.accent} />
        <style>{globalCss}</style>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <style>{globalCss}</style>
      <Sidebar
        projects={projects} selectedId={selectedId} view={view} openTodoCount={openTodoCount}
        onSelectProject={(id) => { setSelectedId(id); setView("project"); }}
        onSelectDashboard={() => { setSelectedId(null); setView("dashboard"); }}
        onSelectTodos={() => { setSelectedId(null); setView("todos"); }}
        onAddProject={addProject}
        saveState={saveState}
      />
      <main style={styles.main}>
        {view === "dashboard" && (
          <Dashboard projects={projects} onOpen={(id) => { setSelectedId(id); setView("project"); }} onAddProject={addProject} />
        )}
        {view === "project" && selected && (
          <ProjectView
            project={selected}
            onBack={() => setView("dashboard")}
            onUpdate={(fn) => updateProject(selected.id, fn)}
            onDelete={() => deleteProject(selected.id)}
          />
        )}
        {view === "todos" && (
          <TodoBoard
            todos={allTodos}
            onToggleDone={(projectId, kind, itemId, done) =>
              updateProject(projectId, (draft) => {
                for (const c of draft.channels) {
                  if (kind === "other") {
                    const t = (c.otherTodos || []).find((x) => x.id === itemId);
                    if (t) t.done = done;
                  } else {
                    for (const iss of c.issues) {
                      const a = iss.actions.find((x) => x.id === itemId);
                      if (a) a.done = done;
                    }
                  }
                }
              })
            }
            onSetDue={(projectId, kind, itemId, due) =>
              updateProject(projectId, (draft) => {
                for (const c of draft.channels) {
                  if (kind === "other") {
                    const t = (c.otherTodos || []).find((x) => x.id === itemId);
                    if (t) t.due = due;
                  } else {
                    for (const iss of c.issues) {
                      const a = iss.actions.find((x) => x.id === itemId);
                      if (a) a.due = due;
                    }
                  }
                }
              })
            }
            onOpenProject={(id) => { setSelectedId(id); setView("project"); }}
          />
        )}
      </main>
    </div>
  );
}

// ---------- Sidebar ----------
function Sidebar({ projects, selectedId, view, openTodoCount, onSelectProject, onSelectDashboard, onSelectTodos, onAddProject, saveState }) {
  return (
    <aside style={{
      width: 264, background: "rgba(255,255,255,0.78)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
      borderRight: `1px solid ${COLORS.hair}`, display: "flex", flexDirection: "column", height: "100vh", position: "sticky", top: 0,
    }}>
      <div style={{ padding: "24px 22px 16px" }}>
        <div style={{ fontWeight: 800, fontSize: 19, color: COLORS.ink2, letterSpacing: -0.4 }}>Account Board</div>
        <div style={{ fontSize: 12, color: COLORS.sub, marginTop: 2 }}>案件を俯瞰する</div>
        <div style={{
          marginTop: 10, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 700,
          padding: "3px 9px", borderRadius: 999,
          background: supabase ? COLORS.successSoft : "rgba(0,0,0,0.045)",
          color: supabase ? COLORS.success : COLORS.sub,
        }}>
          {supabase ? "🌐 チーム共有中(Supabase)" : "💻 このPCのみに保存"}
        </div>
      </div>
      <nav style={{ padding: "4px 14px" }}>
        <SideItem icon={<LayoutGrid size={16} />} label="案件一覧" active={view === "dashboard"} onClick={onSelectDashboard} />
        <SideItem icon={<ListChecks size={16} />} label="TODOリスト" active={view === "todos"} onClick={onSelectTodos} badge={openTodoCount > 0 ? openTodoCount : null} />
      </nav>
      <div style={{ padding: "18px 22px 8px", fontSize: 12, color: COLORS.sub, fontWeight: 600 }}>案件</div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 14px" }}>
        {projects.map((p) => {
          const openTodos = p.channels.reduce((acc, c) => acc + c.issues.reduce((a2, iss) => a2 + iss.actions.filter((x) => x.isTodo && !x.done).length, 0) + (c.otherTodos || []).filter((x) => !x.done).length, 0);
          return (
            <SideItem key={p.id} icon={<Building2 size={16} />} label={p.name || "無題の案件"}
              active={view === "project" && selectedId === p.id}
              onClick={() => onSelectProject(p.id)}
              badge={openTodos > 0 ? openTodos : null} badgeColor={COLORS.todo} />
          );
        })}
      </div>
      <div style={{ padding: 18 }}>
        <button onClick={onAddProject} className="pill-btn" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, ...positiveBtn }}>
          <Plus size={15} /> 新規案件
        </button>
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11.5, color: COLORS.sub }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: saveState === "saving" ? "#E8A63A" : COLORS.success,
            display: "inline-block",
          }} />
          {saveState === "saving" ? "保存中…" : "保存済み"}
        </div>
      </div>
    </aside>
  );
}

function SideItem({ icon, label, active, onClick, badge, badgeColor }) {
  return (
    <button onClick={onClick} className="nav-item" style={{
      width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 12, border: "none",
      background: active ? "rgba(0,0,0,0.055)" : "transparent",
      color: COLORS.ink2, fontWeight: active ? 700 : 500, fontSize: 13.5, marginBottom: 2, textAlign: "left",
    }}>
      <span style={{ display: "flex", opacity: active ? 1 : 0.55 }}>{icon}</span>
      <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      {badge ? <span style={{ background: badgeColor || COLORS.accent, color: "#fff", fontSize: 10.5, fontWeight: 700, borderRadius: 10, padding: "1px 7px", minWidth: 18, textAlign: "center" }}>{badge}</span> : null}
    </button>
  );
}

// ---------- Dashboard ----------
function Dashboard({ projects, onOpen, onAddProject }) {
  return (
    <div>
      <header style={{ marginBottom: 30 }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0, color: COLORS.ink2, letterSpacing: -0.8 }}>案件一覧</h1>
        <p style={{ color: COLORS.sub, marginTop: 6, fontSize: 14.5 }}>担当している全案件を一目で確認できます。</p>
      </header>
      {projects.length === 0 ? (
        <EmptyState title="まだ案件がありません" desc="最初の案件を追加して、チャネルごとの現状・課題・TODOを管理しましょう。" action={<button onClick={onAddProject} className="pill-btn" style={positiveBtn}>+ 新規案件を作成</button>} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {projects.map((p) => {
            const issueCount = p.channels.reduce((a, c) => a + c.issues.length, 0);
            const actionCount = p.channels.reduce((a, c) => a + c.issues.reduce((b, iss) => b + iss.actions.length, 0), 0);
            const totalTodos = p.channels.reduce((a, c) => a + c.issues.reduce((b, iss) => b + iss.actions.filter((x) => x.isTodo).length, 0) + (c.otherTodos || []).length, 0);
            const openTodos = p.channels.reduce((a, c) => a + c.issues.reduce((b, iss) => b + iss.actions.filter((x) => x.isTodo && !x.done).length, 0) + (c.otherTodos || []).filter((x) => !x.done).length, 0);
            const doneTodos = totalTodos - openTodos;
            return (
              <div key={p.id} className="card-hover" onClick={() => onOpen(p.id)} style={{ ...surfaceCard(18), padding: "20px 22px", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16.5, color: COLORS.ink2, letterSpacing: -0.2 }}>{p.name || "無題の案件"}</div>
                    {p.client && <div style={{ fontSize: 12.5, color: COLORS.sub, marginTop: 2 }}>{p.client}</div>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {openTodos > 0 && <span style={{ background: COLORS.todoSoft, color: COLORS.todo, fontSize: 11, fontWeight: 700, borderRadius: 10, padding: "2px 9px" }}>TODO {openTodos}</span>}
                    {totalTodos > 0 && <ProgressRing percent={doneTodos / totalTodos} label={`TODO達成率 ${doneTodos}/${totalTodos}`} />}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, fontSize: 12.5, color: COLORS.sub }}>
                  <Users size={13} /> {p.owner || "担当者未設定"}
                </div>
                <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {p.channels.map((c) => {
                    const col = channelColor(c.name);
                    return <span key={c.id} style={{ fontSize: 11.5, background: col.bg, color: col.fg, borderRadius: 8, padding: "3px 9px", fontWeight: 600 }}>{c.name}</span>;
                  })}
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 14, fontSize: 12.5, fontWeight: 500 }}>
                  <span style={{ color: COLORS.issue }}>課題 {issueCount}</span>
                  <span style={{ color: COLORS.action }}>打ち手 {actionCount}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState({ title, desc, action }) {
  return (
    <div style={{ ...surfaceCard(18), boxShadow: "none", border: `1px dashed ${COLORS.hairStrong}`, padding: "52px 24px", textAlign: "center" }}>
      <div style={{ fontWeight: 700, fontSize: 16.5, marginBottom: 6, color: COLORS.ink2 }}>{title}</div>
      <div style={{ color: COLORS.sub, marginBottom: 20 }}>{desc}</div>
      {action}
    </div>
  );
}

// ---------- Project view ----------
function ProjectView({ project, onBack, onUpdate, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeChannelId, setActiveChannelId] = useState(null);
  const addChannel = () => {
    onUpdate((draft) => draft.channels.push(emptyChannel(`チャネル${draft.channels.length + 1}`)));
  };
  const activeChannel = project.channels.find((c) => c.id === activeChannelId) || null;

  return (
    <div>
      <button
        onClick={activeChannel ? () => setActiveChannelId(null) : onBack}
        className="ghost-btn"
        style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", borderRadius: 8, color: COLORS.sub, fontSize: 13, marginBottom: 16, padding: "4px 6px", marginLeft: -6 }}
      >
        <ChevronLeft size={15} /> {activeChannel ? "全チャネルを見る" : "案件一覧に戻る"}
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 26 }}>
        <div style={{ flex: 1 }}>
          <input value={project.name} onChange={(e) => onUpdate((d) => { d.name = e.target.value; })} placeholder="案件名"
            style={{ fontSize: 28, fontWeight: 800, color: COLORS.ink2, border: "none", background: "transparent", outline: "none", width: "100%", padding: "2px 0", letterSpacing: -0.6 }} />
          <div style={{ display: "flex", gap: 26, marginTop: 10 }}>
            <LabeledInput label="クライアント" value={project.client} onChange={(v) => onUpdate((d) => { d.client = v; })} />
            <LabeledInput label="担当者(全体)" icon={<Users size={12} />} value={project.owner} onChange={(v) => onUpdate((d) => { d.owner = v; })} />
          </div>
        </div>
        <div>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className="icon-btn" style={iconBtnStyle} title="案件を削除"><Trash2 size={15} color={COLORS.sub} /></button>
          ) : (
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={onDelete} style={{ padding: "6px 12px", borderRadius: 999, border: "none", background: COLORS.issue, color: "#fff", fontSize: 12, fontWeight: 600 }}>削除する</button>
              <button onClick={() => setConfirmDelete(false)} style={{ padding: "6px 12px", borderRadius: 999, border: `1px solid ${COLORS.hair}`, background: "#fff", fontSize: 12, fontWeight: 600 }}>取消</button>
            </div>
          )}
        </div>
      </div>

      {activeChannel ? (
        <>
          {/* quick switch between channels while in detail view */}
          {project.channels.length > 1 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              {project.channels.map((c) => (
                <button key={c.id} onClick={() => setActiveChannelId(c.id)} style={{
                  fontSize: 12.5, fontWeight: 600, background: c.id === activeChannel.id ? COLORS.ink : "#fff",
                  color: c.id === activeChannel.id ? "#fff" : COLORS.ink2,
                  border: `1px solid ${c.id === activeChannel.id ? COLORS.ink : COLORS.hair}`,
                  borderRadius: 999, padding: "6px 14px",
                }}>{c.name}</button>
              ))}
            </div>
          )}
          <ChannelSection
            channel={activeChannel}
            onChange={(fn) => onUpdate((draft) => { fn(draft.channels.find((c) => c.id === activeChannel.id)); })}
            onDelete={() => { onUpdate((draft) => { draft.channels = draft.channels.filter((c) => c.id !== activeChannel.id); }); setActiveChannelId(null); }}
          />
        </>
      ) : (
        <>
          <div style={{ fontSize: 12.5, color: COLORS.sub, fontWeight: 600, marginBottom: 14 }}>
            チャネル俯瞰 — クリックで詳細へ
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14, marginBottom: 22 }}>
            {project.channels.map((ch) => (
              <ChannelOverviewCard key={ch.id} channel={ch} onOpen={() => setActiveChannelId(ch.id)} />
            ))}
          </div>
        </>
      )}

      <button onClick={addChannel} className="ghost-btn" style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 999, border: `1px dashed ${COLORS.hairStrong}`, background: "transparent", color: COLORS.sub, fontSize: 13, marginTop: 10 }}>
        <Plus size={14} /> チャネルを追加(Meta / TikTok / SmartNews / Google P-MAX など)
      </button>
    </div>
  );
}

// ---------- Channel overview card (all-channel at-a-glance grid) ----------
function ChannelOverviewCard({ channel, onOpen }) {
  const issueCount = channel.issues.length;
  const actionCount = channel.issues.reduce((a, iss) => a + iss.actions.length, 0);
  const totalTodos = channel.issues.reduce((a, iss) => a + iss.actions.filter((x) => x.isTodo).length, 0) + (channel.otherTodos || []).length;
  const openTodos = channel.issues.reduce((a, iss) => a + iss.actions.filter((x) => x.isTodo && !x.done).length, 0) + (channel.otherTodos || []).filter((x) => !x.done).length;
  const doneTodos = totalTodos - openTodos;
  const nonEmptyIssues = channel.issues.filter((iss) => iss.text.trim());
  const preview = nonEmptyIssues.slice(0, 3);
  const remaining = nonEmptyIssues.length - preview.length;
  const col = channelColor(channel.name);

  return (
    <div onClick={onOpen} className="card-hover" style={{
      ...surfaceCard(16), padding: "18px 20px", cursor: "pointer",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{
            width: 26, height: 26, borderRadius: 9, background: col.bg, color: col.fg,
            display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12.5, flexShrink: 0,
          }}>{(channel.name || "?").slice(0, 1).toUpperCase()}</span>
          <div style={{ fontWeight: 700, fontSize: 15.5, color: COLORS.ink2, letterSpacing: -0.2 }}>{channel.name}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {openTodos > 0 && <span style={{ background: COLORS.todoSoft, color: COLORS.todo, fontSize: 10.5, fontWeight: 700, borderRadius: 9, padding: "1px 7px" }}>TODO {openTodos}</span>}
          {totalTodos > 0 && <ProgressRing percent={doneTodos / totalTodos} size={28} label={`TODO達成率 ${doneTodos}/${totalTodos}`} />}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8, fontSize: 12, color: COLORS.sub }}>
        <Users size={11} /> {channel.owner || "担当者未設定"}
      </div>

      <div style={{ display: "flex", gap: 13, marginTop: 12, fontSize: 11.5, fontWeight: 500 }}>
        <span style={{ color: COLORS.issue }}>課題 {issueCount}</span>
        <span style={{ color: COLORS.action }}>打ち手 {actionCount}</span>
        <span style={{ color: channel.metricsHeaders.length ? COLORS.accent : COLORS.sub }}>
          数値{channel.metricsHeaders.length ? "取込済" : "未取込"}
        </span>
      </div>

      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        {preview.length === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.sub, fontStyle: "italic" }}>課題未登録</div>
        ) : preview.map((iss) => (
          <div key={iss.id} style={{ fontSize: 12.5, color: COLORS.ink2, display: "flex", gap: 6, alignItems: "flex-start" }}>
            <span style={{ color: COLORS.issue, flexShrink: 0, marginTop: 1 }}>●</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical" }}>
              {iss.text}<span style={{ color: COLORS.sub }}> ({iss.actions.filter((a) => a.text.trim()).length}打ち手)</span>
            </span>
          </div>
        ))}
        {remaining > 0 && <div style={{ fontSize: 11.5, color: COLORS.sub }}>ほか {remaining} 件</div>}
      </div>
    </div>
  );
}

function LabeledInput({ label, value, onChange, icon }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: COLORS.sub, fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>{icon}{label}</div>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="未設定"
        style={{ border: "none", borderBottom: `1px solid ${COLORS.hair}`, background: "transparent", fontSize: 13.5, padding: "3px 0", outline: "none", minWidth: 140, color: COLORS.ink2 }} />
    </div>
  );
}

// ---------- Channel section ----------
function ChannelSection({ channel, onChange, onDelete }) {
  const [importOpen, setImportOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);

  const doImport = () => {
    if (!pasteText.trim()) { setImportOpen(false); return; }
    const parsed = Papa.parse(pasteText.trim(), { skipEmptyLines: true });
    const rows = parsed.data;
    if (rows.length === 0) return;
    onChange((c) => { c.metricsHeaders = rows[0]; c.metricsRows = rows.slice(1); c.metricsUpdatedAt = Date.now(); });
    setPasteText(""); setImportOpen(false);
  };

  const addIssue = () => onChange((c) => c.issues.push(emptyIssue()));
  const openTodos = channel.issues.reduce((a, iss) => a + iss.actions.filter((x) => x.isTodo && !x.done).length, 0) + (channel.otherTodos || []).filter((x) => !x.done).length;

  return (
    <section style={{ ...surfaceCard(20), padding: "22px 24px", marginBottom: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            width: 28, height: 28, borderRadius: 9, background: channelColor(channel.name).bg, color: channelColor(channel.name).fg,
            display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, flexShrink: 0,
          }}>{(channel.name || "?").slice(0, 1).toUpperCase()}</span>
          <input value={channel.name} onChange={(e) => onChange((c) => { c.name = e.target.value; })}
            style={{ fontWeight: 700, fontSize: 17, color: COLORS.ink2, border: "none", background: "transparent", outline: "none", letterSpacing: -0.3 }} />
          {openTodos > 0 && <span style={{ background: COLORS.todoSoft, color: COLORS.todo, fontSize: 11, fontWeight: 700, borderRadius: 10, padding: "1px 8px" }}>TODO {openTodos}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <LabeledInput label="担当者" icon={<Users size={11} />} value={channel.owner} onChange={(v) => onChange((c) => { c.owner = v; })} />
          {!confirmDel ? (
            <button onClick={() => setConfirmDel(true)} className="icon-btn" style={{ ...iconBtnStyle, padding: 6 }}><X size={13} color={COLORS.sub} /></button>
          ) : (
            <div style={{ display: "flex", gap: 5 }}>
              <button onClick={onDelete} style={{ padding: "4px 10px", borderRadius: 999, border: "none", background: COLORS.issue, color: "#fff", fontSize: 11, fontWeight: 600 }}>削除</button>
              <button onClick={() => setConfirmDel(false)} style={{ padding: "4px 10px", borderRadius: 999, border: `1px solid ${COLORS.hair}`, background: "#fff", fontSize: 11, fontWeight: 600 }}>取消</button>
            </div>
          )}
        </div>
      </div>

      {/* Metrics */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }}>
          <div style={{ fontSize: 12.5, color: COLORS.sub, fontWeight: 600 }}>現状数値</div>
          <button onClick={() => setImportOpen((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", color: COLORS.accent, fontSize: 12.5, fontWeight: 600, padding: 0 }}>
            <ClipboardPaste size={13} /> スプレッドシートから貼り付け
          </button>
        </div>
        {importOpen && (
          <div style={{ marginBottom: 10 }}>
            <textarea autoFocus value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={"スプレッドシートの範囲をコピーしてここに貼り付け（1行目は見出し）"}
              style={{ width: "100%", minHeight: 90, border: `1px solid ${COLORS.hair}`, borderRadius: 12, padding: 12, fontSize: 12.5, fontFamily: MONO, outline: "none", resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={doImport} className="pill-btn" style={{ ...primaryBtn, padding: "7px 16px", fontSize: 12.5 }}>取り込む</button>
              <button onClick={() => { setImportOpen(false); setPasteText(""); }} style={{ ...ghostBtn, padding: "7px 16px", fontSize: 12.5 }}>キャンセル</button>
            </div>
          </div>
        )}
        {channel.metricsHeaders.length > 0 ? (
          <div style={{ overflowX: "auto", border: `1px solid ${COLORS.hair}`, borderRadius: 14 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: MONO, fontSize: 12 }}>
              <thead><tr>{channel.metricsHeaders.map((h, i) => <th key={i} style={{ textAlign: "left", padding: "8px 14px", background: "rgba(0,0,0,0.03)", color: COLORS.ink2, fontWeight: 600, borderBottom: `1px solid ${COLORS.hair}`, whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
              <tbody>{channel.metricsRows.map((row, ri) => <tr key={ri}>{row.map((cell, ci) => <td key={ci} style={{ padding: "7px 14px", borderBottom: `1px solid ${COLORS.hair}`, whiteSpace: "nowrap", color: COLORS.ink2 }}>{cell}</td>)}</tr>)}</tbody>
            </table>
          </div>
        ) : (!importOpen && <div style={{ fontSize: 12.5, color: COLORS.sub, fontStyle: "italic" }}>数値未取込</div>)}
        {channel.metricsUpdatedAt && <div style={{ fontSize: 11, color: COLORS.sub, marginTop: 5 }}>最終取込: {new Date(channel.metricsUpdatedAt).toLocaleString("ja-JP")}</div>}
      </div>

      {/* Issues + nested actions */}
      <div>
        <div style={{ fontSize: 12.5, color: COLORS.sub, fontWeight: 600, marginBottom: 11 }}>課題 / 打ち手</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {channel.issues.map((iss) => (
            <IssueBlock
              key={iss.id}
              issue={iss}
              onChange={(fn) => onChange((c) => fn(c.issues.find((x) => x.id === iss.id)))}
              onDelete={() => onChange((c) => { c.issues = c.issues.filter((x) => x.id !== iss.id); })}
            />
          ))}
        </div>
        <button onClick={addIssue} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 999, border: `1px dashed ${COLORS.issue}55`, background: "transparent", color: COLORS.issue, fontSize: 12.5, fontWeight: 600, marginTop: 12 }}>
          <Plus size={13} /> 課題を追加
        </button>
      </div>

      {/* Channel-level todos not tied to a specific issue */}
      <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px solid ${COLORS.hair}` }}>
        <div style={{ fontSize: 12.5, color: COLORS.sub, fontWeight: 600, marginBottom: 11 }}>
          その他TODO<span style={{ fontWeight: 400, fontSize: 11.5, marginLeft: 6, opacity: 0.8 }}>（特定の課題に紐づかないタスク）</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(channel.otherTodos || []).map((t) => (
            <OtherTodoCard
              key={t.id}
              todo={t}
              onChange={(fn) => onChange((c) => fn((c.otherTodos || []).find((x) => x.id === t.id)))}
              onDelete={() => onChange((c) => { c.otherTodos = (c.otherTodos || []).filter((x) => x.id !== t.id); })}
            />
          ))}
        </div>
        <button onClick={() => onChange((c) => { if (!c.otherTodos) c.otherTodos = []; c.otherTodos.push(emptyOtherTodo()); })} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 999, border: `1px dashed ${COLORS.todo}55`, background: "transparent", color: COLORS.todo, fontSize: 12.5, fontWeight: 600, marginTop: 12 }}>
          <Plus size={13} /> その他TODOを追加
        </button>
      </div>
    </section>
  );
}

// ---------- Channel-level "other" todo card (not tied to an issue) ----------
function OtherTodoCard({ todo, onChange, onDelete }) {
  return (
    <div style={{ background: COLORS.todoSoft, border: `1px solid ${COLORS.todo}26`, borderRadius: 14, padding: "10px 12px" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <button onClick={() => onChange((t) => { t.done = !t.done; })} style={{ background: "none", border: "none", padding: 0, marginTop: 2, flexShrink: 0 }}>
          {todo.done ? <CheckSquare size={15} color={COLORS.success} /> : <Square size={15} color={COLORS.sub} />}
        </button>
        <div style={{ flex: 1 }}>
          <textarea
            value={todo.text}
            onChange={(e) => onChange((t) => { t.text = e.target.value; })}
            placeholder="TODOを入力…（例: 月次レポートを送付する）"
            rows={1}
            style={{ width: "100%", border: "none", background: "transparent", resize: "vertical", fontSize: 13, color: COLORS.ink2, outline: "none", fontFamily: FONT, padding: 0, textDecoration: todo.done ? "line-through" : "none" }}
          />
          <MemoField value={todo.memo} onChange={(v) => onChange((t) => { t.memo = v; })} color={COLORS.todo} />
        </div>
        <button onClick={onDelete} style={{ background: "none", border: "none", padding: 2, flexShrink: 0 }}><Trash2 size={12} color={COLORS.sub} /></button>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginTop: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <CalendarDays size={12} color={COLORS.sub} />
          <input type="date" value={todo.due || ""} onChange={(e) => onChange((t) => { t.due = e.target.value; })}
            style={{ fontSize: 11.5, border: `1px solid ${COLORS.todo}26`, borderRadius: 8, padding: "2px 6px", background: "#fff", color: COLORS.ink2 }} />
        </div>
      </div>
    </div>
  );
}

// ---------- Issue block (1 issue -> N actions) ----------
function IssueBlock({ issue, onChange, onDelete }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const addAction = () => onChange((iss) => iss.actions.push(emptyAction()));
  const openCount = issue.actions.filter((a) => a.isTodo && !a.done).length;

  return (
    <div style={{ border: `1px solid ${COLORS.issue}22`, borderRadius: 16, overflow: "hidden" }}>
      {/* issue header */}
      <div style={{ background: COLORS.issueSoft, padding: "11px 13px", display: "flex", gap: 8, alignItems: "flex-start" }}>
        <AlertCircle size={15} color={COLORS.issue} style={{ marginTop: 3, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <textarea
            value={issue.text}
            onChange={(e) => onChange((iss) => { iss.text = e.target.value; })}
            placeholder="課題を入力…"
            rows={1}
            style={{ width: "100%", border: "none", background: "transparent", resize: "vertical", fontSize: 13.5, fontWeight: 600, color: COLORS.ink2, outline: "none", fontFamily: FONT, padding: 0 }}
          />
          <MemoField value={issue.memo} onChange={(v) => onChange((iss) => { iss.memo = v; })} color={COLORS.issue} />
        </div>
        {openCount > 0 && <span style={{ background: "#fff", color: COLORS.todo, fontSize: 10.5, fontWeight: 700, borderRadius: 8, padding: "1px 6px", flexShrink: 0 }}>TODO {openCount}</span>}
        {!confirmDel ? (
          <button onClick={() => setConfirmDel(true)} style={{ background: "none", border: "none", padding: 2, flexShrink: 0 }}><Trash2 size={13} color={COLORS.sub} /></button>
        ) : (
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            <button onClick={onDelete} style={{ background: COLORS.issue, color: "#fff", border: "none", borderRadius: 999, fontSize: 10.5, fontWeight: 600, padding: "3px 8px" }}>削除</button>
            <button onClick={() => setConfirmDel(false)} style={{ background: "#fff", border: `1px solid ${COLORS.hair}`, borderRadius: 999, fontSize: 10.5, fontWeight: 600, padding: "3px 8px" }}>取消</button>
          </div>
        )}
      </div>

      {/* nested actions */}
      <div style={{ padding: "11px 13px 13px 30px", display: "flex", flexDirection: "column", gap: 8, borderLeft: `2px solid ${COLORS.issue}18`, marginLeft: 14 }}>
        {issue.actions.map((act) => (
          <ActionCard
            key={act.id}
            action={act}
            onChange={(fn) => onChange((iss) => fn(iss.actions.find((x) => x.id === act.id)))}
            onDelete={() => onChange((iss) => { iss.actions = iss.actions.filter((x) => x.id !== act.id); })}
          />
        ))}
        <button onClick={addAction} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 999, border: `1px dashed ${COLORS.action}55`, background: "transparent", color: COLORS.action, fontSize: 12, fontWeight: 600, alignSelf: "flex-start" }}>
          <Plus size={12} /> 打ち手を追加
        </button>
      </div>
    </div>
  );
}

// ---------- Action card ----------
function ActionCard({ action, onChange, onDelete }) {
  return (
    <div style={{ background: COLORS.actionSoft, border: `1px solid ${COLORS.action}22`, borderRadius: 14, padding: "10px 12px" }}>
      <div style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
        <Hammer size={13} color={COLORS.action} style={{ marginTop: 3, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <textarea
            value={action.text}
            onChange={(e) => onChange((a) => { a.text = e.target.value; })}
            placeholder="打ち手を入力…"
            rows={1}
            style={{ width: "100%", border: "none", background: "transparent", resize: "vertical", fontSize: 13, color: COLORS.ink2, outline: "none", fontFamily: FONT, padding: 0 }}
          />
          <MemoField value={action.memo} onChange={(v) => onChange((a) => { a.memo = v; })} color={COLORS.action} />
        </div>
        <button onClick={onDelete} style={{ background: "none", border: "none", padding: 2, flexShrink: 0 }}><Trash2 size={12} color={COLORS.sub} /></button>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: COLORS.todo, cursor: "pointer", fontWeight: 500 }}>
          <input type="checkbox" checked={action.isTodo} onChange={(e) => onChange((a) => { a.isTodo = e.target.checked; })} style={{ accentColor: COLORS.todo }} />
          TODO化
        </label>
        {action.isTodo && (
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <CalendarDays size={12} color={COLORS.sub} />
            <input type="date" value={action.due || ""} onChange={(e) => onChange((a) => { a.due = e.target.value; })}
              style={{ fontSize: 11.5, border: `1px solid ${COLORS.action}22`, borderRadius: 8, padding: "2px 6px", background: "#fff", color: COLORS.ink2 }} />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Memo field (collapsible) ----------
function MemoField({ value, onChange, color }) {
  const [open, setOpen] = useState(!!value);
  return (
    <div style={{ marginTop: 5 }}>
      <button onClick={() => setOpen((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0, fontSize: 11, color: color, opacity: 0.85, fontWeight: 500 }}>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <StickyNote size={11} />
        メモ{value && !open ? "（記入あり）" : ""}
      </button>
      {open && (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="詳細メモ…背景、根拠、参考リンクなど"
          rows={2}
          style={{ width: "100%", marginTop: 5, border: `1px solid ${color}22`, borderRadius: 10, background: "#fff", fontSize: 12, color: COLORS.ink2, outline: "none", padding: "7px 9px", resize: "vertical", fontFamily: FONT }}
        />
      )}
    </div>
  );
}

// ---------- Global TODO board (grouped by project) ----------
function TodoBoard({ todos, onToggleDone, onSetDue, onOpenProject }) {
  const [filter, setFilter] = useState("open"); // open | all | done

  const byProject = {};
  todos.forEach((t) => {
    if (!byProject[t.projectId]) byProject[t.projectId] = { name: t.projectName, items: [] };
    byProject[t.projectId].items.push(t);
  });

  const groups = Object.entries(byProject).map(([projectId, g]) => {
    const filtered = g.items.filter((t) => filter === "all" ? true : filter === "open" ? !t.done : t.done);
    const sorted = [...filtered].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.due && b.due) return a.due.localeCompare(b.due);
      if (a.due) return -1;
      if (b.due) return 1;
      return 0;
    });
    return { projectId, name: g.name, items: sorted, openCount: g.items.filter((t) => !t.done).length };
  }).filter((g) => g.items.length > 0)
    .sort((a, b) => b.openCount - a.openCount);

  return (
    <div>
      <header style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0, color: COLORS.ink2, letterSpacing: -0.8 }}>TODOリスト</h1>
        <p style={{ color: COLORS.sub, marginTop: 6, fontSize: 14.5 }}>案件ごとにまとまって表示されます。打ち手カードで「TODO化」すると、ここに反映されます。</p>
      </header>

      <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
        {[["open", "未完了"], ["all", "すべて"], ["done", "完了"]].map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)} style={{
            padding: "7px 16px", borderRadius: 999, border: `1px solid ${filter === key ? COLORS.ink : COLORS.hair}`,
            background: filter === key ? COLORS.ink : "#fff", color: filter === key ? "#fff" : COLORS.sub, fontSize: 12.5, fontWeight: 600,
          }}>{label}</button>
        ))}
      </div>

      {groups.length === 0 ? (
        <EmptyState title="TODOはありません" desc="打ち手カードの「TODO化」にチェックすると、ここに表示されます。" action={null} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          {groups.map((g) => (
            <div key={g.projectId}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Layers size={14} color={COLORS.ink} style={{ opacity: 0.6 }} />
                <button onClick={() => onOpenProject(g.projectId)} style={{ background: "none", border: "none", padding: 0, fontWeight: 700, fontSize: 15.5, color: COLORS.ink2, letterSpacing: -0.2 }}>
                  {g.name || "無題の案件"}
                </button>
                {g.openCount > 0
                  ? <span style={{ fontSize: 11, color: COLORS.todo, background: COLORS.todoSoft, borderRadius: 8, padding: "1px 8px", fontWeight: 700 }}>未完了 {g.openCount}</span>
                  : <span style={{ fontSize: 11, color: COLORS.success, background: COLORS.successSoft, borderRadius: 8, padding: "1px 8px", fontWeight: 700 }}>🎉 全て完了</span>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {g.items.map((t) => (
                  <div key={t.id} className="card-hover" style={{ display: "flex", alignItems: "flex-start", gap: 12, ...surfaceCard(14), padding: "13px 16px", opacity: t.done ? 0.55 : 1 }}>
                    <button onClick={() => onToggleDone(t.projectId, t.kind, t.id, !t.done)} style={{ background: "none", border: "none", marginTop: 1 }}>
                      {t.done ? <CheckSquare size={17} color={COLORS.success} /> : <Square size={17} color={COLORS.sub} />}
                    </button>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, color: COLORS.ink2, textDecoration: t.done ? "line-through" : "none", fontWeight: 600 }}>
                        {t.text || <span style={{ fontStyle: "italic", color: COLORS.sub, fontWeight: 400 }}>（内容未入力）</span>}
                      </div>
                      {t.memo && <div style={{ fontSize: 12, color: COLORS.sub, marginTop: 4, whiteSpace: "pre-wrap" }}>{t.memo}</div>}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7, fontSize: 11.5, flexWrap: "wrap" }}>
                        <span style={{ color: COLORS.action, background: COLORS.actionSoft, borderRadius: 7, padding: "1px 8px", fontWeight: 600 }}>{t.channelName}</span>
                        {t.channelOwner && <span style={{ color: COLORS.sub, display: "flex", alignItems: "center", gap: 3 }}><Users size={11} />{t.channelOwner}</span>}
                        {t.issueText ? <span style={{ color: COLORS.issue }}>課題: {t.issueText}</span> : <span style={{ color: COLORS.todo, background: COLORS.todoSoft, borderRadius: 7, padding: "1px 8px" }}>その他TODO</span>}
                      </div>
                    </div>
                    <div>
                      <input type="date" value={t.due || ""} onChange={(e) => onSetDue(t.projectId, t.kind, t.id, e.target.value)}
                        style={{ fontSize: 12, border: `1px solid ${COLORS.hair}`, borderRadius: 8, padding: "4px 8px", color: COLORS.ink2 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
