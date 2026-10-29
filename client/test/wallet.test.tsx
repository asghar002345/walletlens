import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { connect } from "wagmi/actions";
import { SimulateForm } from "../src/components/SimulateForm";
import { WalletButton } from "../src/wallet/WalletButton";
import { createWagmiConfig } from "../src/wallet/config";
import { makeConfig, renderWithProviders, TEST_ACCOUNT } from "./utils";

afterEach(() => vi.unstubAllGlobals());

function stubApi() {
  const fn = vi.fn(async (url: string, _init?: RequestInit) => {
    void _init;
    if (url.endsWith("/analyses")) return new Response(JSON.stringify({ analysis: { id: "a1" } }), { status: 201 });
    return new Response("{}", { status: 401 });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("wallet config", () => {
  it("is testnet-only and adds WalletConnect only with a project id", () => {
    const without = createWagmiConfig({});
    expect(without.chains.map((c) => c.id)).toEqual([11155111, 80002]);
    expect(without.connectors.map((c) => c.type)).toEqual(["injected"]);
    const withWc = createWagmiConfig({ walletConnectProjectId: "demo-project-id" });
    expect(withWc.connectors.map((c) => c.type)).toContain("walletConnect");
  });
});

describe("connect modal", () => {
  it("opens as an accessible dialog, notes that WalletConnect is hidden, and closes on Escape", async () => {
    stubApi();
    renderWithProviders(<WalletButton walletConnectEnabled={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    const dialog = screen.getByRole("dialog", { name: "Connect a wallet" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByTestId("wc-disabled-note")).toHaveTextContent("VITE_WALLETCONNECT_PROJECT_ID");
    expect(within(dialog).getByText(/never asks your wallet to sign/)).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("connects with a connector and shows the address and network", async () => {
    stubApi();
    renderWithProviders(<WalletButton walletConnectEnabled={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    await userEvent.click(screen.getByRole("button", { name: /Mock Connector/ }));
    expect(await screen.findByText("0xd213…507B")).toBeInTheDocument();
    expect(screen.getByText("Sepolia")).toBeInTheDocument();
  });
});

describe("simulate signing request", () => {
  it("uses the connected address as from and posts an unsigned request with value in wei", async () => {
    const fetch = stubApi();
    const config = makeConfig();
    const onCreated = vi.fn();
    renderWithProviders(<SimulateForm chainId={11155111} onCreated={onCreated} />, "/", config);
    await act(async () => {
      await connect(config, { connector: config.connectors[0] });
    });
    await waitFor(() => expect(screen.getByLabelText("From")).toHaveValue(TEST_ACCOUNT));
    await userEvent.type(screen.getByLabelText("To"), "0x4444444444444444444444444444444444444444");
    await userEvent.type(screen.getByLabelText("Value (native token)"), "0.01");
    await userEvent.click(screen.getByRole("button", { name: "Simulate & analyse" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const [, init] = fetch.mock.calls.find(([u]) => String(u).endsWith("/analyses"))!;
    expect(JSON.parse(String(init?.body))).toEqual({
      kind: "signRequest",
      chainId: 11155111,
      request: { from: TEST_ACCOUNT, to: "0x4444444444444444444444444444444444444444", value: "0x2386f26fc10000" },
    });
  });

  it("validates fields client-side and fills demo presets", async () => {
    const fetch = stubApi();
    renderWithProviders(<SimulateForm chainId={11155111} onCreated={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("From"), "0x123");
    await userEvent.click(screen.getByRole("button", { name: "Simulate & analyse" }));
    expect(screen.getByText("Enter a valid 0x address")).toBeInTheDocument();
    expect(screen.getByText("Add a recipient or calldata")).toBeInTheDocument();
    expect(fetch.mock.calls.some(([u]) => String(u).endsWith("/analyses"))).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Unlimited approve" }));
    expect((screen.getByLabelText("Calldata") as HTMLTextAreaElement).value).toMatch(/^0x095ea7b3/);
  });
});
