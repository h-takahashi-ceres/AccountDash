import React, { useState, useEffect, useRef } from "react";
import {
  Plus, X, Users, CheckSquare, Square, Trash2,
  ChevronLeft, ChevronDown, ChevronRight, LayoutGrid, Building2,
  AlertCircle, Hammer, CalendarDays, Loader2, StickyNote, Link2, Check
} from "lucide-react";
import { supabase, TEAM_ROOM_ID } from "./supabaseClient";
import logo from "./assets/logo.png";

// ---------- helpers ----------
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const STORAGE_KEY = "ap_board_v3";
const MY_NAME_KEY = "ap_my_name";

const emptySubtask = (text = "") => ({ id: genId(), text, done: false });
const emptyAction = () => ({
  id: genId(), text: "", memo: "", isTodo: false, done: false, due: "",
  assignee: "", priority: "", subtasks: [],
});
const emptyIssue = () => ({
  id: genId(), text: "", memo: "", actions: [emptyAction()],
});
const emptyOtherTodo = () => ({
  id: genId(), text: "", memo: "", done: false, due: "",
  assignee: "", priority: "", subtasks: [],
});
const emptyChannel = (name = "新しいチャネル") => ({
  id: genId(), name, owner: "",
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

// migrate older saved data so it never crashes the app
function migrateProject(p) {
  if (!p.channels) p.channels = [];
  p.channels.forEach((c) => {
    if (!c.otherTodos) c.otherTodos = [];
    if (!c.issues) {
      const oldCards = c.cards || [];
      const issues = oldCards.filter((cd) => cd.type === "issue").map((cd) => ({
        id: cd.id, text: cd.text || "", memo: "", actions: [],
      }));
      const orphanActions = oldCards.filter((cd) => cd.type === "action").map((cd) => ({
        id: cd.id, text: cd.text || "", memo: "",
        isTodo: !!cd.isTodo, done: !!cd.done, due: cd.due || "",
      }));
      if (orphanActions.length) issues.push({ id: genId(), text: "(旧データ)", memo: "", actions: orphanActions });
      c.issues = issues.length ? issues : [emptyIssue()];
      delete c.cards;
    }
    c.issues.forEach((iss) => {
      (iss.actions || []).forEach((a) => {
        if (a.assignee === undefined) a.assignee = "";
        if (a.priority === undefined) a.priority = "";
        if (!a.subtasks) a.subtasks = [];
      });
    });
    (c.otherTodos || []).forEach((t) => {
      if (t.assignee === undefined) t.assignee = "";
      if (t.priority === undefined) t.priority = "";
      if (!t.subtasks) t.subtasks = [];
    });
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
COLORS.line = COLORS.hair;
COLORS.success = "#2FA84F";
COLORS.successSoft = "#E6F6EA";

const CHANNEL_PALETTE = [
  { bg: "#FFEAEA", fg: "#DD5A4E" },
  { bg: "#FFF3DC", fg: "#C98A16" },
  { bg: "#E7F8EC", fg: "#2AA35A" },
  { bg: "#E7F1FF", fg: "#2E7BD6" },
  { bg: "#F3EBFF", fg: "#8A5BC7" },
  { bg: "#FFEAF4", fg: "#D6488F" },
  { bg: "#EAF6F6", fg: "#1F9490" },
];
function channelColor(name) {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CHANNEL_PALETTE[h % CHANNEL_PALETTE.length];
}

const PRIORITY_OPTIONS = [
  { value: "", label: "優先度なし" },
  { value: "low", label: "🔵 低" },
  { value: "medium", label: "🟡 中" },
  { value: "high", label: "🔴 高" },
];

function ProgressRing({ percent, size = 34, label }) {
  const pct = Math.max(0, Math.min(1, percent));
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }} title={label}>
      <div style={{ width: size, height: size, borderRadius: "50%", background: `conic-gradient(${COLORS.success} ${pct * 360}deg, rgba(0,0,0,0.07) 0deg)` }} />
      <div style={{ position: "absolute", inset: 4, borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size > 30 ? 10 : 9, fontWeight: 700, color: COLORS.success }}>
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
input, textarea, button, select {
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
.tab-btn:hover { background: rgba(0,0,0,0.04); }
`;

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', 'Segoe UI', Helvetica, Arial, sans-serif";

const styles = {
  app: { display: "flex", minHeight: "100vh", background: COLORS.bg, color: COLORS.ink, fontFamily: FONT, fontSize: 14, letterSpacing: -0.1 },
  main: { flex: 1, padding: "36px 44px", overflowY: "auto", maxHeight: "100vh" },
};

const surfaceCard = (radius = 18) => ({
  background: COLORS.panel,
  border: `1px solid ${COLORS.hair}`,
  borderRadius: radius,
  boxShadow: "0 1px 2px rgba(0,0,0,0.03), 0 6px 18px rgba(0,0,0,0.035)",
});

const primaryBtn = { padding: "10px 20px", borderRadius: 999, border: "none", background: COLORS.ink, color: "#fff", fontWeight: 600, fontSize: 13.5 };
const positiveBtn = {
  padding: "10px 20px", borderRadius: 999, border: "none",
  background: `linear-gradient(135deg, ${COLORS.success}, ${COLORS.accent})`,
  color: "#fff", fontWeight: 700, fontSize: 13.5, boxShadow: "0 4px 14px rgba(47,168,79,0.28)",
};
const ghostBtn = { padding: "10px 20px", borderRadius: 999, border: `1px solid ${COLORS.hair}`, background: "#fff", color: COLORS.ink, fontWeight: 600, fontSize: 13.5 };
const iconBtnStyle = { border: `1px solid ${COLORS.hair}`, background: "#fff", borderRadius: 10, padding: 7 };
const selectStyle = {
  border: "none", borderBottom: `1px solid ${COLORS.hair}`, background: "transparent",
  fontSize: 13.5, padding: "3px 0", outline: "none", minWidth: 140, color: COLORS.ink2,
};

// ---------- root ----------
export default function AccountDashboard() {
  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("dashboard");
  const [selectedId, setSelectedId] = useState(null);
  const [saveState, setSaveState] = useState("idle");
  const skipNextSave = useRef(false);
  const [myName, setMyName] = useState(null);

  useEffect(() => {
    setMyName(localStorage.getItem(MY_NAME_KEY) || "");
  }, []);

  function applyIncoming(payload) {
    if (!payload) return;
    if (Array.isArray(payload)) {
      setProjects(payload.map(migrateProject));
      setMembers([]);
    } else {
      setProjects((payload.projects || []).map(migrateProject));
      setMembers(payload.members || []);
    }
  }

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
          applyIncoming(data.data);
        }
        setLoaded(true);

        channel = supabase
          .channel("account_board_" + TEAM_ROOM_ID)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "account_board", filter: `id=eq.${TEAM_ROOM_ID}` },
            (payload) => {
              if (payload.new && payload.new.data) {
                skipNextSave.current = true;
                applyIncoming(payload.new.data);
              }
            }
          )
          .subscribe();
      })();
      return () => { if (channel) supabase.removeChannel(channel); };
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) applyIncoming(JSON.parse(raw));
    } catch (e) { /* no data yet */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (skipNextSave.current) { skipNextSave.current = false; return; }
    setSaveState("saving");
    const t = setTimeout(async () => {
      const payload = { members, projects };
      try {
        if (supabase) {
          const { error } = await supabase
            .from("account_board")
            .upsert({ id: TEAM_ROOM_ID, data: payload, updated_at: new Date().toISOString() });
          if (error) throw error;
        } else {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        }
        setSaveState("saved");
      } catch (e) { console.error("save failed:", e); setSaveState("idle"); }
    }, 400);
    return () => clearTimeout(t);
  }, [projects, members, loaded]);

  const selected = projects.find((p) => p.id === selectedId) || null;

  // deep link: open directly into a shared project link like ?project=<id>
  const appliedUrlProject = useRef(false);
  useEffect(() => {
    if (!loaded || appliedUrlProject.current) return;
    const params = new URLSearchParams(window.location.search);
    const pid = params.get("project");
    if (pid && projects.some((p) => p.id === pid)) {
      setSelectedId(pid);
      setView("project");
    }
    appliedUrlProject.current = true;
  }, [loaded, projects]);

  // keep the address bar in sync so "copy this link" always reflects what's on screen
  useEffect(() => {
    if (!appliedUrlProject.current) return; // don't overwrite the URL before we've read it
    const url = new URL(window.location.href);
    if (view === "project" && selectedId) {
      url.searchParams.set("project", selectedId);
    } else {
      url.searchParams.delete("project");
      url.searchParams.delete("tab");
    }
    window.history.replaceState(null, "", url.toString());
  }, [view, selectedId]);

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
  const addMember = (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setMembers((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
  };
  const joinAs = (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem(MY_NAME_KEY, trimmed);
    setMyName(trimmed);
    addMember(trimmed);
  };

  if (!loaded || myName === null) {
    return (
      <div style={{ ...styles.app, alignItems: "center", justifyContent: "center" }}>
        <Loader2 className="spin" size={22} color={COLORS.accent} />
        <style>{globalCss}</style>
      </div>
    );
  }

  if (myName === "") {
    return <JoinGate onJoin={joinAs} />;
  }

  return (
    <div style={styles.app}>
      <style>{globalCss}</style>
      <Sidebar
        projects={projects} selectedId={selectedId} view={view}
        myName={myName}
        onChangeName={() => { localStorage.removeItem(MY_NAME_KEY); setMyName(""); }}
        onSelectProject={(id) => { setSelectedId(id); setView("project"); }}
        onSelectDashboard={() => { setSelectedId(null); setView("dashboard"); }}
        onAddProject={addProject}
        saveState={saveState}
      />
      <main style={styles.main}>
        {view === "dashboard" && (
          <Dashboard projects={projects} onOpen={(id) => { setSelectedId(id); setView("project"); }} onAddProject={addProject} />
        )}
        {view === "project" && selected && (
          <ProjectView
            key={selected.id}
            project={selected}
            members={members}
            onAddMember={addMember}
            onBack={() => setView("dashboard")}
            onUpdate={(fn) => updateProject(selected.id, fn)}
            onDelete={() => deleteProject(selected.id)}
          />
        )}
      </main>
    </div>
  );
}

// ---------- Join gate: register a name once per browser before using the board ----------
function JoinGate({ onJoin }) {
  const [name, setName] = useState("");
  return (
    <div style={{ ...styles.app, alignItems: "center", justifyContent: "center" }}>
      <style>{globalCss}</style>
      <div style={{ ...surfaceCard(20), padding: "36px 34px", width: 380 }}>
        <img src={logo} alt="Account Dash" style={{ height: 44, marginBottom: 16, display: "block" }} />
        <div style={{ fontSize: 13, color: COLORS.sub, marginBottom: 22, lineHeight: 1.6 }}>
          お名前を登録してください。担当者のプルダウンに表示されるようになります。
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onJoin(name); }}>
          <input
            autoFocus
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 山田 太郎"
            style={{ width: "100%", padding: "11px 13px", borderRadius: 10, border: `1px solid ${COLORS.hair}`, fontSize: 14, outline: "none", marginBottom: 14, fontFamily: FONT, color: COLORS.ink2 }}
          />
          <button type="submit" className="pill-btn" style={{ ...positiveBtn, width: "100%" }}>参加する</button>
        </form>
      </div>
    </div>
  );
}

// ---------- Sidebar ----------
function Sidebar({ projects, selectedId, view, myName, onChangeName, onSelectProject, onSelectDashboard, onAddProject, saveState }) {
  return (
    <aside style={{
      width: 264, background: "rgba(255,255,255,0.78)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
      borderRight: `1px solid ${COLORS.hair}`, display: "flex", flexDirection: "column", height: "100vh", position: "sticky", top: 0,
    }}>
      <div style={{ padding: "22px 22px 16px" }}>
        <img src={logo} alt="Account Dash" style={{ height: 30, display: "block" }} />
        <div style={{ fontSize: 12, color: COLORS.sub, marginTop: 8 }}>案件課題を"最速"で解決する</div>
        <div style={{
          marginTop: 10, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 700,
          padding: "3px 9px", borderRadius: 999,
          background: supabase ? COLORS.successSoft : "rgba(0,0,0,0.045)",
          color: supabase ? COLORS.success : COLORS.sub,
        }}>
          {supabase ? "🌐 チーム共有中(Supabase)" : "💻 このPCのみに保存"}
        </div>
        {supabase && (
          <div style={{ marginTop: 10 }}>
            <CopyLinkButton
              getUrl={() => `${window.location.origin}${window.location.pathname}`}
              label="招待リンクをコピー"
              style={{ width: "100%", justifyContent: "center" }}
            />
          </div>
        )}
      </div>
      <nav style={{ padding: "4px 14px" }}>
        <SideItem icon={<LayoutGrid size={16} />} label="案件一覧" active={view === "dashboard"} onClick={onSelectDashboard} />
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
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: saveState === "saving" ? "#E8A63A" : COLORS.success, display: "inline-block" }} />
          {saveState === "saving" ? "保存中…" : "保存済み"}
        </div>
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${COLORS.hair}`, textAlign: "center" }}>
          <div style={{ fontSize: 11.5, color: COLORS.sub }}>{myName} さん</div>
          <button onClick={onChangeName} style={{ background: "none", border: "none", padding: 0, fontSize: 11, color: COLORS.accent, fontWeight: 600, marginTop: 2 }}>
            名前を変更
          </button>
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

// ---------- 課題 > 打ち手 > TODO preview tree (Dashboard only, kept compact) ----------
function IssuePreviewTree({ issues, maxIssues = 2, maxActionsPerIssue = 2, getChannelTag }) {
  const shown = issues.slice(0, maxIssues);
  if (shown.length === 0) {
    return <div style={{ fontSize: 12, color: COLORS.sub, fontStyle: "italic" }}>課題未登録</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {shown.map((iss) => {
        const acts = iss.actions.filter((a) => a.text.trim());
        const actsShown = acts.slice(0, maxActionsPerIssue);
        const moreActs = acts.length - actsShown.length;
        const tag = getChannelTag ? getChannelTag(iss) : null;
        return (
          <div key={iss.id}>
            <div style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12.5, color: COLORS.ink2, fontWeight: 600 }}>
              <AlertCircle size={12} color={COLORS.issue} style={{ marginTop: 2, flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical" }}>
                {tag && <span style={{ fontSize: 10, fontWeight: 700, color: tag.fg, background: tag.bg, borderRadius: 5, padding: "1px 5px", marginRight: 5 }}>{tag.name}</span>}
                {iss.text}
              </span>
            </div>
            {actsShown.length > 0 && (
              <div style={{ marginLeft: 18, marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
                {actsShown.map((a) => (
                  <div key={a.id} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11.5, color: COLORS.sub }}>
                    <Hammer size={10} color={COLORS.action} style={{ flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{a.text}</span>
                    {a.isTodo && <span title={a.done ? "TODO完了" : "TODO未完了"} style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: a.done ? COLORS.success : COLORS.todo }} />}
                  </div>
                ))}
                {moreActs > 0 && <div style={{ fontSize: 10.5, color: COLORS.sub, marginLeft: 16 }}>ほか {moreActs} 打ち手</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
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
            const allIssues = p.channels.flatMap((c) => c.issues.filter((iss) => iss.text.trim()).map((iss) => ({ ...iss, _channelName: c.name })));
            const issuePreview = allIssues.slice(0, 2);
            const issueRemaining = allIssues.length - issuePreview.length;
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
                <div style={{ marginTop: 13, paddingTop: 13, borderTop: `1px solid ${COLORS.hair}` }}>
                  <IssuePreviewTree issues={issuePreview} getChannelTag={(iss) => ({ name: iss._channelName, ...channelColor(iss._channelName) })} />
                  {issueRemaining > 0 && <div style={{ fontSize: 11, color: COLORS.sub, marginTop: 6 }}>ほか {issueRemaining} 件の課題</div>}
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

// copies a link to the clipboard and shows a brief "コピーしました" confirmation
function CopyLinkButton({ getUrl, label, style }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const url = getUrl();
    try {
      await navigator.clipboard.writeText(url);
    } catch (e) {
      // clipboard API unavailable (e.g. insecure context) — fall back to a manual prompt
      window.prompt("このURLをコピーしてください:", url);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <button onClick={copy} className="ghost-btn" style={{
      display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600,
      color: copied ? COLORS.success : COLORS.accent, background: copied ? COLORS.successSoft : "transparent",
      border: `1px solid ${copied ? COLORS.success : COLORS.hair}`, borderRadius: 999, padding: "6px 13px",
      ...style,
    }}>
      {copied ? <Check size={13} /> : <Link2 size={13} />}
      {copied ? "コピーしました" : label}
    </button>
  );
}

function LabeledInput({ label, value, onChange, icon }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: COLORS.sub, fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>{icon}{label}</div>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="未設定" style={selectStyle} />
    </div>
  );
}

function LabeledMemberSelect({ label, value, onChange, members, icon }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: COLORS.sub, fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>{icon}{label}</div>
      <select value={value || ""} onChange={(e) => onChange(e.target.value)} style={{ ...selectStyle, minWidth: 120 }}>
        <option value="">未設定</option>
        {members.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
    </div>
  );
}

// ---------- Project view: 2 tabs — チャネル状況 / TODO ----------
function ProjectView({ project, members, onAddMember, onBack, onUpdate, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tab, setTab] = useState("channels");
  const [activeChannelId, setActiveChannelId] = useState(null);

  const addChannel = () => onUpdate((draft) => draft.channels.push(emptyChannel(`チャネル${draft.channels.length + 1}`)));
  const activeChannel = project.channels.find((c) => c.id === activeChannelId) || null;

  const projectTodos = [];
  project.channels.forEach((c) => {
    c.issues.forEach((iss) =>
      iss.actions.forEach((act) => {
        if (act.isTodo) {
          projectTodos.push({ ...act, kind: "action", channelId: c.id, channelName: c.name, issueId: iss.id, issueText: iss.text });
        }
      })
    );
    (c.otherTodos || []).forEach((t) => {
      projectTodos.push({ ...t, kind: "other", channelId: c.id, channelName: c.name, issueId: null, issueText: null });
    });
  });

  return (
    <div>
      <button onClick={onBack} className="ghost-btn" style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", borderRadius: 8, color: COLORS.sub, fontSize: 13, marginBottom: 16, padding: "4px 6px", marginLeft: -6 }}>
        <ChevronLeft size={15} /> 案件一覧に戻る
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <input value={project.name} onChange={(e) => onUpdate((d) => { d.name = e.target.value; })} placeholder="案件名"
            style={{ fontSize: 28, fontWeight: 800, color: COLORS.ink2, border: "none", background: "transparent", outline: "none", width: "100%", padding: "2px 0", letterSpacing: -0.6 }} />
          <div style={{ display: "flex", gap: 26, marginTop: 10 }}>
            <LabeledInput label="クライアント" value={project.client} onChange={(v) => onUpdate((d) => { d.client = v; })} />
            <LabeledMemberSelect label="担当者(全体)" icon={<Users size={12} />} value={project.owner} members={members} onChange={(v) => onUpdate((d) => { d.owner = v; })} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {supabase && (
            <CopyLinkButton
              getUrl={() => `${window.location.origin}${window.location.pathname}?project=${project.id}`}
              label="このページのリンクをコピー"
            />
          )}
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

      <div style={{ display: "flex", gap: 4, marginBottom: 22, borderBottom: `1px solid ${COLORS.hair}` }}>
        {[["channels", "チャネル状況"], ["todos", "TODO"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className="tab-btn" style={{
            padding: "10px 18px", background: "none", border: "none", borderBottom: `2px solid ${tab === key ? COLORS.ink : "transparent"}`,
            color: tab === key ? COLORS.ink2 : COLORS.sub, fontWeight: tab === key ? 700 : 500, fontSize: 14, marginBottom: -1,
          }}>{label}</button>
        ))}
      </div>

      {tab === "channels" ? (
        activeChannel ? (
          <>
            <button onClick={() => setActiveChannelId(null)} className="ghost-btn" style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", borderRadius: 8, color: COLORS.sub, fontSize: 13, marginBottom: 14, padding: "4px 6px", marginLeft: -6 }}>
              <ChevronLeft size={15} /> チャネル一覧に戻る
            </button>
            {project.channels.length > 1 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
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
              members={members}
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
            <button onClick={addChannel} className="ghost-btn" style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 999, border: `1px dashed ${COLORS.hairStrong}`, background: "transparent", color: COLORS.sub, fontSize: 13, marginTop: 10 }}>
              <Plus size={14} /> チャネルを追加(Meta / TikTok / SmartNews / Google P-MAX など)
            </button>
          </>
        )
      ) : (
        <ProjectTodoList todos={projectTodos} members={members} onAddMember={onAddMember} onUpdate={onUpdate} />
      )}
    </div>
  );
}

// ---------- Channel overview card (grid preview; click to open full detail) ----------
function ChannelOverviewCard({ channel, onOpen }) {
  const issueCount = channel.issues.length;
  const actionCount = channel.issues.reduce((a, iss) => a + iss.actions.length, 0);
  const totalTodos = channel.issues.reduce((a, iss) => a + iss.actions.filter((x) => x.isTodo).length, 0) + (channel.otherTodos || []).length;
  const openTodos = channel.issues.reduce((a, iss) => a + iss.actions.filter((x) => x.isTodo && !x.done).length, 0) + (channel.otherTodos || []).filter((x) => !x.done).length;
  const doneTodos = totalTodos - openTodos;
  const nonEmptyIssues = channel.issues.filter((iss) => iss.text.trim());
  const preview = nonEmptyIssues.slice(0, 2);
  const remaining = nonEmptyIssues.length - preview.length;
  const col = channelColor(channel.name);

  return (
    <div onClick={onOpen} className="card-hover" style={{ ...surfaceCard(16), padding: "18px 20px", cursor: "pointer", display: "flex", flexDirection: "column" }}>
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
      </div>
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        <IssuePreviewTree issues={preview} />
        {remaining > 0 && <div style={{ fontSize: 11.5, color: COLORS.sub, marginTop: 2 }}>ほか {remaining} 件</div>}
      </div>
    </div>
  );
}

// ---------- Channel section (チャネル状況 tab: shows everything, no truncation) ----------
function ChannelSection({ channel, members, onChange, onDelete }) {
  const [confirmDel, setConfirmDel] = useState(false);

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
          <LabeledMemberSelect label="担当者" icon={<Users size={11} />} value={channel.owner} members={members} onChange={(v) => onChange((c) => { c.owner = v; })} />
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

function IssueBlock({ issue, onChange, onDelete }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const addAction = () => onChange((iss) => iss.actions.push(emptyAction()));
  const openCount = issue.actions.filter((a) => a.isTodo && !a.done).length;

  return (
    <div style={{ border: `1px solid ${COLORS.issue}22`, borderRadius: 16, overflow: "hidden" }}>
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
          style={{ width: "100%", marginTop: 4, border: `1px solid ${color}22`, borderRadius: 10, background: "#fff", fontSize: 12, color: COLORS.ink2, outline: "none", padding: "7px 9px", resize: "vertical", fontFamily: FONT }}
        />
      )}
    </div>
  );
}

// ================= TODO tab: Asana List-view style, scoped to one project =================

function isOverdue(dateStr, done) {
  if (!dateStr || done) return false;
  return dateStr < new Date().toISOString().slice(0, 10);
}

function AssigneeSelect({ value, members, onChange }) {
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)} title="担当者" style={{
      width: 108, fontSize: 12, border: "none", background: "transparent", color: value ? COLORS.ink2 : COLORS.sub,
      outline: "none", padding: "3px 2px",
    }}>
      <option value="">未アサイン</option>
      {members.map((m) => <option key={m} value={m}>{m}</option>)}
    </select>
  );
}

function PrioritySelect({ value, onChange }) {
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)} title="優先度" style={{
      width: 96, fontSize: 12, border: "none", background: "transparent", color: value ? COLORS.ink2 : COLORS.sub, outline: "none", padding: "3px 2px",
    }}>
      {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function SubtaskRow({ subtask, onToggle, onDelete }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0 5px 40px" }}>
      <button onClick={() => onToggle(!subtask.done)} style={{ background: "none", border: "none", padding: 2, display: "flex" }}>
        {subtask.done ? <CheckSquare size={14} color={COLORS.success} /> : <Square size={14} color={COLORS.hairStrong} />}
      </button>
      <span style={{ fontSize: 12.5, color: subtask.done ? COLORS.sub : COLORS.ink2, textDecoration: subtask.done ? "line-through" : "none", flex: 1 }}>
        {subtask.text}
      </span>
      <button onClick={onDelete} style={{ background: "none", border: "none", padding: 2 }}><Trash2 size={11} color={COLORS.sub} /></button>
    </div>
  );
}

function AddSubtaskRow({ onAdd }) {
  const [text, setText] = useState("");
  const commit = () => { if (text.trim()) onAdd(text.trim()); setText(""); };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px 5px 40px" }}>
      <Plus size={12} color={COLORS.sub} />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
        onBlur={commit}
        placeholder="サブタスクを追加してEnter"
        style={{ flex: 1, fontSize: 12.5, border: "none", outline: "none", background: "transparent", fontFamily: FONT, color: COLORS.ink2 }}
      />
    </div>
  );
}

function TaskRow({ task, members, onToggleDone, onSetDue, onSetAssignee, onSetPriority, onAddSubtask, onToggleSubtask, onDeleteSubtask }) {
  const [hover, setHover] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const overdue = isOverdue(task.due, task.done);
  const subtasks = task.subtasks || [];
  const doneSubtasks = subtasks.filter((s) => s.done).length;

  return (
    <div>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: "flex", alignItems: "center", gap: 8, padding: "9px 10px 9px 4px",
          borderBottom: `1px solid ${COLORS.hair}`, background: hover ? "rgba(0,0,0,0.018)" : "transparent",
        }}
      >
        <button onClick={() => onToggleDone(!task.done)} style={{ background: "none", border: "none", padding: 4, flexShrink: 0, display: "flex" }}>
          {task.done ? <CheckSquare size={18} color={COLORS.success} /> : <Square size={18} color={COLORS.hairStrong} />}
        </button>

        <button onClick={() => setExpanded((v) => !v)} style={{ background: "none", border: "none", padding: 2, flexShrink: 0, display: "flex" }}>
          {expanded ? <ChevronDown size={13} color={COLORS.sub} /> : <ChevronRight size={13} color={COLORS.sub} />}
        </button>

        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            fontSize: 13.5, color: task.done ? COLORS.sub : COLORS.ink2, textDecoration: task.done ? "line-through" : "none",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {task.text || <span style={{ fontStyle: "italic" }}>(内容未入力)</span>}
          </span>
          {task.issueText ? (
            <span style={{ fontSize: 11, color: COLORS.issue, background: COLORS.issueSoft, borderRadius: 6, padding: "1px 7px", flexShrink: 0 }}>課題: {task.issueText}</span>
          ) : (
            <span style={{ fontSize: 11, color: COLORS.todo, background: COLORS.todoSoft, borderRadius: 6, padding: "1px 7px", flexShrink: 0 }}>その他TODO</span>
          )}
          {task.memo && <StickyNote size={12} color={COLORS.sub} title={task.memo} style={{ flexShrink: 0 }} />}
          {subtasks.length > 0 && (
            <span style={{ fontSize: 11, color: COLORS.sub, flexShrink: 0, display: "flex", alignItems: "center", gap: 2 }}>
              <CheckSquare size={11} /> {doneSubtasks}/{subtasks.length}
            </span>
          )}
        </div>

        <AssigneeSelect value={task.assignee} members={members} onChange={onSetAssignee} />
        <PrioritySelect value={task.priority} onChange={onSetPriority} />

        <input
          type="date"
          value={task.due || ""}
          onChange={(e) => onSetDue(e.target.value)}
          style={{
            fontSize: 12, border: "none", borderRadius: 7, padding: "3px 6px", width: 108,
            background: overdue ? COLORS.issueSoft : "transparent",
            color: overdue ? COLORS.issue : (task.due ? COLORS.ink2 : COLORS.sub),
            fontWeight: overdue ? 700 : 500,
          }}
        />
      </div>

      {expanded && (
        <div style={{ background: "rgba(0,0,0,0.012)", borderBottom: `1px solid ${COLORS.hair}` }}>
          {subtasks.map((s) => (
            <SubtaskRow key={s.id} subtask={s} onToggle={(done) => onToggleSubtask(s.id, done)} onDelete={() => onDeleteSubtask(s.id)} />
          ))}
          <AddSubtaskRow onAdd={(text) => onAddSubtask(text)} />
        </div>
      )}
    </div>
  );
}

function AddTaskRow({ onAdd }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const commit = () => { if (text.trim()) onAdd(text.trim()); setText(""); setAdding(false); };

  if (!adding) {
    return (
      <button onClick={() => setAdding(true)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 10px 9px 30px", background: "none", border: "none", color: COLORS.sub, fontSize: 13, width: "100%", textAlign: "left" }}>
        <Plus size={13} /> タスクを追加
      </button>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px 8px 34px" }}>
      <input
        autoFocus value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setText(""); setAdding(false); } }}
        onBlur={commit}
        placeholder="タスク名を入力してEnter"
        style={{ flex: 1, fontSize: 13.5, border: `1px solid ${COLORS.accent}55`, borderRadius: 7, padding: "6px 9px", outline: "none", fontFamily: FONT }}
      />
    </div>
  );
}

function SectionHeader({ icon, title, count, badge, collapsed, onToggle, indent = 0 }) {
  return (
    <button onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", background: "none", border: "none", padding: `8px 8px 8px ${4 + indent}px`, textAlign: "left" }}>
      {collapsed ? <ChevronRight size={14} color={COLORS.sub} /> : <ChevronDown size={14} color={COLORS.sub} />}
      {icon}
      <span style={{ fontWeight: 600, fontSize: 13.5, color: COLORS.ink2, letterSpacing: -0.2 }}>{title}</span>
      <span style={{ fontSize: 12, color: COLORS.sub }}>{count}</span>
      <span style={{ flex: 1 }} />
      {badge}
    </button>
  );
}

function ProjectTodoList({ todos, members, onAddMember, onUpdate }) {
  const [filter, setFilter] = useState("open");
  const [collapsedChannels, setCollapsedChannels] = useState(() => new Set());
  const [newMemberBox, setNewMemberBox] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");

  const toggleChannel = (id) => setCollapsedChannels((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const mutate = (kind, itemId, fn) => onUpdate((draft) => {
    for (const c of draft.channels) {
      if (kind === "other") {
        const t = (c.otherTodos || []).find((x) => x.id === itemId);
        if (t) fn(t);
      } else {
        for (const iss of c.issues) {
          const a = iss.actions.find((x) => x.id === itemId);
          if (a) fn(a);
        }
      }
    }
  });

  const byChannel = new Map();
  todos.forEach((t) => {
    if (!byChannel.has(t.channelId)) byChannel.set(t.channelId, { name: t.channelName, items: [] });
    byChannel.get(t.channelId).items.push(t);
  });

  const channelGroups = Array.from(byChannel.entries()).map(([channelId, ch]) => {
    const filtered = ch.items.filter((t) => filter === "all" ? true : filter === "open" ? !t.done : t.done);
    const sorted = [...filtered].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.due && b.due) return a.due.localeCompare(b.due);
      if (a.due) return -1;
      if (b.due) return 1;
      return 0;
    });
    return { channelId, name: ch.name, items: sorted, openCount: ch.items.filter((t) => !t.done).length, totalCount: ch.items.length };
  }).filter((c) => c.items.length > 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {[["open", "未完了"], ["all", "すべて"], ["done", "完了"]].map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)} style={{
              padding: "7px 16px", borderRadius: 999, border: `1px solid ${filter === key ? COLORS.ink : COLORS.hair}`,
              background: filter === key ? COLORS.ink : "#fff", color: filter === key ? "#fff" : COLORS.sub, fontSize: 12.5, fontWeight: 600,
            }}>{label}</button>
          ))}
        </div>
        <div>
          {!newMemberBox ? (
            <button onClick={() => setNewMemberBox(true)} style={{ background: "none", border: "none", fontSize: 12.5, color: COLORS.accent, fontWeight: 600 }}>
              + メンバーを追加
            </button>
          ) : (
            <div style={{ display: "flex", gap: 6 }}>
              <input
                autoFocus value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { onAddMember(newMemberName); setNewMemberName(""); setNewMemberBox(false); } }}
                placeholder="名前"
                style={{ fontSize: 12.5, border: `1px solid ${COLORS.hair}`, borderRadius: 7, padding: "4px 8px", outline: "none" }}
              />
              <button onClick={() => { onAddMember(newMemberName); setNewMemberName(""); setNewMemberBox(false); }} style={{ ...ghostBtn, padding: "4px 10px", fontSize: 12 }}>追加</button>
            </div>
          )}
        </div>
      </div>

      {channelGroups.length === 0 ? (
        <EmptyState title="TODOはありません" desc="チャネル状況タブで打ち手を「TODO化」するか、下のリストから直接タスクを追加できます。" action={null} />
      ) : (
        <div style={{ ...surfaceCard(16), overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px 8px 56px", background: "rgba(0,0,0,0.025)", borderBottom: `1px solid ${COLORS.hair}` }}>
            <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: COLORS.sub, textTransform: "uppercase", letterSpacing: 0.4 }}>タスク名</span>
            <span style={{ width: 108, fontSize: 11, fontWeight: 700, color: COLORS.sub, textTransform: "uppercase", letterSpacing: 0.4 }}>担当</span>
            <span style={{ width: 96, fontSize: 11, fontWeight: 700, color: COLORS.sub, textTransform: "uppercase", letterSpacing: 0.4 }}>優先度</span>
            <span style={{ width: 108, fontSize: 11, fontWeight: 700, color: COLORS.sub, textTransform: "uppercase", letterSpacing: 0.4 }}>期限</span>
          </div>

          {channelGroups.map((ch, idx) => {
            const collapsed = collapsedChannels.has(ch.channelId);
            const col = channelColor(ch.name);
            return (
              <div key={ch.channelId} style={{ borderBottom: idx < channelGroups.length - 1 ? `1px solid ${COLORS.hair}` : "none" }}>
                <div style={{ background: "rgba(0,0,0,0.03)" }}>
                  <SectionHeader
                    icon={<span style={{ width: 8, height: 8, borderRadius: "50%", background: col.fg, flexShrink: 0 }} />}
                    title={ch.name}
                    count={`(${ch.totalCount})`}
                    collapsed={collapsed}
                    onToggle={() => toggleChannel(ch.channelId)}
                    badge={ch.openCount > 0
                      ? <span style={{ fontSize: 10.5, color: COLORS.todo, background: COLORS.todoSoft, borderRadius: 8, padding: "1px 7px", fontWeight: 700 }}>未完了 {ch.openCount}</span>
                      : <span style={{ fontSize: 10.5, color: COLORS.success, background: COLORS.successSoft, borderRadius: 8, padding: "1px 7px", fontWeight: 700 }}>🎉 全て完了</span>}
                  />
                </div>
                {!collapsed && (
                  <div>
                    {ch.items.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        members={members}
                        onToggleDone={(done) => mutate(t.kind, t.id, (item) => { item.done = done; })}
                        onSetDue={(due) => mutate(t.kind, t.id, (item) => { item.due = due; })}
                        onSetAssignee={(assignee) => mutate(t.kind, t.id, (item) => { item.assignee = assignee; })}
                        onSetPriority={(priority) => mutate(t.kind, t.id, (item) => { item.priority = priority; })}
                        onAddSubtask={(text) => mutate(t.kind, t.id, (item) => { if (!item.subtasks) item.subtasks = []; item.subtasks.push(emptySubtask(text)); })}
                        onToggleSubtask={(subId, done) => mutate(t.kind, t.id, (item) => { const s = (item.subtasks || []).find((x) => x.id === subId); if (s) s.done = done; })}
                        onDeleteSubtask={(subId) => mutate(t.kind, t.id, (item) => { item.subtasks = (item.subtasks || []).filter((x) => x.id !== subId); })}
                      />
                    ))}
                    <AddTaskRow onAdd={(text) => onUpdate((draft) => {
                      const c = draft.channels.find((x) => x.id === ch.channelId);
                      if (c) { if (!c.otherTodos) c.otherTodos = []; c.otherTodos.push({ ...emptyOtherTodo(), text }); }
                    })} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
