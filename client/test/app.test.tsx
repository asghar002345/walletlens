import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAt } from "./utils";

type Handler = (url: string, init?: RequestInit) => { status: number; body?: unknown };
function mockFetch(handler: Handler) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const { status, body } = handler(url, init);
    return new Response(status === 204 ? null : JSON.stringify(body ?? {}), { status });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
const user = { id: "1", name: "Demo", email: "demo@example.com" };

afterEach(() => vi.unstubAllGlobals());

describe("routing and auth", () => {
  it("redirects a signed-out visitor to login", async () => {
    mockFetch(() => ({ status: 401, body: { error: { message: "Not authenticated" } } }));
    renderAt("/app");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows server field errors on register", async () => {
    mockFetch((url) =>
      url.endsWith("/auth/register")
        ? {
            status: 400,
            body: {
              error: {
                message: "Validation failed",
                details: [{ field: "password", message: "Password must be at least 8 characters" }],
              },
            },
          }
        : { status: 401 },
    );
    renderAt("/register");
    await userEvent.click(await screen.findByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Password must be at least 8 characters")).toBeInTheDocument();
  });

  it("logs in and shows the empty dashboard with the mock notice", async () => {
    let signedIn = false;
    mockFetch((url) => {
      if (url.endsWith("/auth/login")) {
        signedIn = true;
        return { status: 200, body: { user } };
      }
      if (url.endsWith("/auth/me")) return signedIn ? { status: 200, body: { user } } : { status: 401 };
      if (url.endsWith("/analyses")) return { status: 200, body: { analyses: [] } };
      if (url.endsWith("/health")) return { status: 200, body: { ok: true, mockMode: true } };
      return { status: 404 };
    });
    renderAt("/login");
    await userEvent.type(await screen.findByLabelText("Email"), user.email);
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("No analyses yet.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/Mock mode/);
  });
});

describe("landing", () => {
  it("shows the hero and sign-up call to action to signed-out visitors", async () => {
    mockFetch(() => ({ status: 401 }));
    renderAt("/");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(/before you sign/);
    expect(screen.getByRole("link", { name: "Get started" })).toHaveAttribute("href", "/register");
    expect(screen.getByRole("link", { name: "Skip to content" })).toBeInTheDocument();
  });
});

describe("analysis form", () => {
  it("rejects a signing request that is not JSON without calling the API", async () => {
    const fetch = mockFetch((url) => {
      if (url.endsWith("/auth/me")) return { status: 200, body: { user } };
      if (url.endsWith("/analyses")) return { status: 200, body: { analyses: [] } };
      return { status: 200, body: { ok: true, mockMode: false } };
    });
    renderAt("/app");
    await userEvent.click(await screen.findByRole("radio", { name: "Paste JSON" }));
    await userEvent.type(screen.getByRole("textbox", { name: /Unsigned transaction/ }), "not json");
    const calls = fetch.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Simulate & analyse" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/valid JSON/);
    await waitFor(() => expect(fetch.mock.calls.length).toBe(calls));
  });
});
