import { describe, expect, it } from "vitest";

describe("supabase configuration", () => {
  it("authenticates with the active publishable key and reads the inspections table", async () => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    expect(url).toBeTruthy();
    expect(key).toBeTruthy();
    const headers = { apikey: key!, Authorization: `Bearer ${key!}` };
    const authResponse = await fetch(`${url}/auth/v1/settings`, { headers });
    expect(authResponse.ok).toBe(true);
    const tableResponse = await fetch(`${url}/rest/v1/inspections?select=inspection_id&limit=1`, { headers });
    expect(tableResponse.ok).toBe(true);
    expect(await tableResponse.json()).toBeInstanceOf(Array);
  }, 15_000);
});
