import { useEffect, useState } from "react";
import { LogOut, Save, ShieldCheck } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useProfile, useSaveProfile } from "@/lib/data";
import { initialsOf } from "@/lib/format";
import { useToast } from "@/components/Toast";
import { Card, Field, SectionTitle, formNumber, formText } from "@/components/ui";

/** Farm profile & account (guide §8): edit your details, sign out. */
export default function Profile() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const { data: profile, isLoading } = useProfile(user?.id);
  const saveProfile = useSaveProfile();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saveProfile.isSuccess) return;
    setSaved(true);
    const timer = window.setTimeout(() => setSaved(false), 2500);
    return () => window.clearTimeout(timer);
  }, [saveProfile.isSuccess, saveProfile.variables]);

  if (!user) return null;

  const submit = (form: FormData) => {
    saveProfile.mutate(
      {
        id: user.id,
        full_name: formText(form, "full_name") || "Corn farmer",
        phone: formText(form, "phone"),
        province: formText(form, "province"),
        municipality: formText(form, "municipality"),
        farm_name: formText(form, "farm_name"),
        farm_size_ha: formNumber(form, "farm_size_ha"),
        corn_variety: formText(form, "corn_variety"),
      },
      {
        onSuccess: () => toast({ title: "Farm profile saved" }),
        onError: (error) =>
          toast({
            title: "Could not save profile",
            description: error instanceof Error ? error.message : "Please try again.",
            variant: "error",
          }),
      }
    );
  };

  return (
    <div className="page-enter">
      <header className="mb-4">
        <a href="/more" className="back-link">
          ← Back to More
        </a>
        <h1 className="page-title">Farm Profile</h1>
        <p className="page-intro">Update your details, farm location and account.</p>
      </header>

      <div className="profile-hero">
        <span className="profile-avatar">{initialsOf(profile?.full_name ?? "Farmer")}</span>
        <div className="min-w-0">
          <b className="block text-[16px] text-[#1c2b21]">{profile?.full_name || "Corn farmer"}</b>
          <span className="text-[11.5px] text-[#5c6b5e]">
            {profile?.farm_name || "Farm name not set"}
          </span>
          <span className="mt-0.5 block text-[11px] text-[#98a394]">{user.email}</span>
        </div>
      </div>

      <Card className="mt-4">
        <SectionTitle>Farmer and farm details</SectionTitle>
        {isLoading ? (
          <div className="loading-block">Loading profile…</div>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              submit(new FormData(event.currentTarget));
            }}
          >
            <Field label="Full name" name="full_name" required defaultValue={profile?.full_name ?? ""} />
            <Field label="Phone number" name="phone" type="tel" defaultValue={profile?.phone ?? ""} placeholder="09xx xxx xxxx" />
            <Field label="Farm / business name" name="farm_name" defaultValue={profile?.farm_name ?? ""} />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Farm size (hectares)"
                name="farm_size_ha"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                defaultValue={profile?.farm_size_ha ?? 0}
              />
              <Field label="Corn variety" name="corn_variety" defaultValue={profile?.corn_variety ?? ""} placeholder="e.g. Dekalb DK 9901" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Municipality / city" name="municipality" defaultValue={profile?.municipality ?? ""} />
              <Field label="Province" name="province" defaultValue={profile?.province ?? ""} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10.5px] text-[#98a394]">
                {saved ? "Saved to your account ✓" : "Changes are saved to your Supabase account."}
              </span>
              <button className="btn-primary flex-none" data-testid="button-save-profile">
                <Save size={15} /> Save profile
              </button>
            </div>
          </form>
        )}
      </Card>

      <Card className="mt-4">
        <SectionTitle>Account</SectionTitle>
        <div className="data-row text-xs">
          <span className="muted">Signed in as</span>
          <b>{user.email}</b>
        </div>
        <div className="data-row text-xs">
          <span className="muted">Password changes</span>
          <b>Use “Forgot password” on the Supabase login screen</b>
        </div>
        <button
          className="btn-outline mt-3 w-full"
          onClick={() => signOut()}
          data-testid="button-signout-profile"
        >
          <LogOut size={15} /> Sign out
        </button>
      </Card>

      <div className="notice mt-4">
        <ShieldCheck size={14} className="mr-1 inline" />
        Your records, budgets and alerts are protected by Supabase Row Level Security — only you can
        read or edit them. Shared listings (prices, buyers, posts) show only what you choose to
        publish.
      </div>
    </div>
  );
}
