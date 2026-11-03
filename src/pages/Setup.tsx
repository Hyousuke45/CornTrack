import { Database, KeyRound, Link2 } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase";

/**
 * Friendly gate shown when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are
 * missing, so the app never crashes with a blank screen.
 */
export function SetupScreen() {
  return (
    <div className="auth-screen page-enter">
      <div className="auth-card" style={{ maxWidth: 430 }}>
        <img src="/favicon.ico" alt="" className="auth-logo mx-auto" style={{ margin: "0 auto" }} />
        <h1 className="auth-card-title" style={{ textAlign: "center" }}>CornTrack needs a database</h1>
        <p className="text-[12.5px] leading-relaxed text-[#5c6b5e]" style={{ textAlign: "center", margin: 0 }}>
          Supabase is not configured yet. Connect the app to your Supabase project in three steps:
        </p>
        <ol className="setup-steps">
          <li>
            <Database size={15} />
            <span>
              Create a free project at <b>supabase.com</b>, then open <b>SQL Editor</b> and run the
              whole <b>supabase/schema.sql</b> file from this project.
            </span>
          </li>
          <li>
            <KeyRound size={15} />
            <span>
              Copy your <b>Project URL</b> and <b>anon public key</b> from Project Settings → API.
            </span>
          </li>
          <li>
            <Link2 size={15} />
            <span>
              Create a <b>.env</b> file next to package.json with{" "}
              <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (see
              .env.example), then restart <code>npm run dev</code>.
            </span>
          </li>
        </ol>
        <div className="notice">
          Row Level Security protects every table — the anon key is safe to use in the browser and
          each farmer can only read and edit their own records.
        </div>
      </div>
    </div>
  );
}

export function useIsConfigured() {
  return isSupabaseConfigured;
}
