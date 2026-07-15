import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// If env vars aren't set (e.g. running locally before setup), `supabase` stays null
// and App.jsx automatically falls back to this browser's localStorage instead.
export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

// A shared "room" id — everyone using the same value sees the same board.
// Change it (e.g. per team) via the VITE_TEAM_ROOM_ID env var if you ever need more than one board.
export const TEAM_ROOM_ID = import.meta.env.VITE_TEAM_ROOM_ID || "default-team";
