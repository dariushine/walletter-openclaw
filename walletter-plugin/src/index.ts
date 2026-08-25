import { Type } from "typebox";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";

type Config = { baseUrl?: string; apiKey?: string };

const normalizeBase = (base?: string): string => {
  const b = (base ?? "").trim();
  if (!b) return "";
  return b.endsWith("/") ? b : `${b}/`;
};

function keyOf(config: Config): string {
  return config.apiKey || process.env.WALLETTER_API_KEY || process.env.WALLETTER_TOKEN || "";
}

async function api<T>(config: Config, path: string, init?: RequestInit): Promise<T> {
  const base = normalizeBase(config.baseUrl);
  if (!base) throw new Error("Walletter API URL not configured.");
  if (!keyOf(config)) throw new Error("Walletter API token not configured.");
  const url = `${base.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "X-Api-Key": keyOf(config),
      ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Walletter API ${res.status}: ${text.slice(0, 300)}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

// --- Module-scoped in-memory cache ------------------------------------------
interface CacheSlot<T> {
  data: T;
  loadedAt: number;
}
interface Wallet {
  id: number;
  name: string;
  alias: string | null;
  type: string;
  currency: string;
  balance: number;
  description: string | null;
  icon?: string | null;
  color?: string | null;
  isActive?: boolean;
  excludeFromTotal?: boolean;
  hideInDashboard?: boolean;
}
interface Category {
  id: number;
  name: string;
  type?: string;
  color?: string | null;
  icon?: string | null;
}
const cache: {
  wallets: CacheSlot<Wallet[]> | null;
  categories: CacheSlot<Category[]> | null;
} = { wallets: null, categories: null };

function isFresh<T>(slot: CacheSlot<T> | null, ttlMs: number): slot is CacheSlot<T> {
  return !!slot && Date.now() - slot.loadedAt < ttlMs;
}
function invalidateWalletCache(): void {
  cache.wallets = null;
}
function invalidateCategoryCache(): void {
  cache.categories = null;
}
async function getWallets(config: Config, opts: { refresh?: boolean } = {}): Promise<Wallet[]> {
  if (!opts.refresh && isFresh(cache.wallets, 60_000)) return cache.wallets!.data;
  const data = await api<Wallet[]>(config, "/wallets");
  cache.wallets = { data, loadedAt: Date.now() };
  return data;
}
async function getCategories(config: Config, opts: { refresh?: boolean } = {}): Promise<Category[]> {
  if (!opts.refresh && isFresh(cache.categories, 60_000)) return cache.categories!.data;
  const data = await api<Category[]>(config, "/categories");
  cache.categories = { data, loadedAt: Date.now() };
  return data;
}

interface LeanWallet {
  id: number;
  name: string;
  alias: string | null;
  currency: string;
  balance: number;
}
interface LeanCategory {
  id: number;
  name: string;
  type?: string;
}
function leanWallets(wallets: Wallet[]): LeanWallet[] {
  return (wallets || []).map((w) => ({
    id: w.id,
    name: w.name,
    alias: w.alias,
    currency: w.currency,
    balance: w.balance,
  }));
}
function leanCategories(categories: Category[]): LeanCategory[] {
  return (categories || []).map((c) => ({ id: c.id, name: c.name, type: c.type }));
}

async function getTimeZone(config: Config): Promise<string | null> {
  try {
    const settings = await api<{ timezone?: string }>(config, "/settings");
    return settings?.timezone ?? null;
  } catch {
    return null;
  }
}

// --- Tools ------------------------------------------------------------------

export default defineToolPlugin({
  id: "walletter",
  name: "Walletter",
  description: "Operate the Walletter API (wallets, transactions, exchanges, rates, recurring, stats, reports).",
  configSchema: Type.Object({
    baseUrl: Type.Optional(Type.String({ description: "Walletter API base URL, as given (no /api added)." })),
    apiKey: Type.Optional(Type.String({ description: "Walletter API token (X-Api-Key / Authorization: Bearer)." })),
  }),
  tools: (tool) => [
    tool({
      name: "walletter_health",
      label: "Walletter Health",
      description: "Check the Walletter API is reachable and healthy.",
      parameters: Type.Object({}),
      execute: async (_p, config) => {
        const base = normalizeBase(config.baseUrl);
        if (!base) return { ok: false, error: "Walletter API URL not configured." };
        const res = await fetch(`${base}health`);
        return { ok: res.ok, status: res.status };
      },
    }),
    tool({
      name: "walletter_lookup",
      label: "Walletter Lookup",
      description:
        "Resolve wallets, categories and the user timezone (ids/names) in one cached call. " +
        "Use this to look up wallet/category ids or names before creating transactions/exchanges/recurring, " +
        "and to get the configured timezone. Returns the cache timestamp. Set refresh=true to force refetch.",
      parameters: Type.Object({
        refresh: Type.Optional(Type.Boolean({ description: "Force refetch from the API." })),
      }),
      execute: async (p, config) => {
        const [wallets, categories, timezone] = await Promise.all([
          getWallets(config, { refresh: !!p.refresh }),
          getCategories(config, { refresh: !!p.refresh }),
          getTimeZone(config),
        ]);
        return {
          source: p.refresh ? "fresh" : "cache",
          cachedAt: cache.wallets?.loadedAt ?? null,
          cachedAtIso: cache.wallets?.loadedAt ? new Date(cache.wallets.loadedAt).toISOString() : null,
          timezone,
          wallets: leanWallets(wallets),
          categories: leanCategories(categories),
        };
      },
    }),
    tool({
      name: "walletter_cache_refresh",
      label: "Walletter Cache Refresh",
      description: "Force-refresh the in-memory wallet and category cache from the API.",
      parameters: Type.Object({}),
      execute: async (_p, config) => {
        const [wallets, categories] = await Promise.all([
          getWallets(config, { refresh: true }),
          getCategories(config, { refresh: true }),
        ]);
        return { refreshed: true, wallets, categories };
      },
    }),
    tool({
      name: "walletter_balance",
      label: "Walletter Balance",
      description: "Consolidated balance per currency from active wallets (cache-backed), plus simplified wallet list with name and balance only.",
      parameters: Type.Object({}),
      execute: async (_p, config) => {
        const wallets = await getWallets(config);
        const currencies: Record<string, number> = {};
        const walletBalances: Array<{ name: string; balance: number }> = [];
        
        for (const w of wallets) {
          if (w.hideInDashboard || w.excludeFromTotal) continue;
          currencies[w.currency] = (currencies[w.currency] ?? 0) + w.balance;
          walletBalances.push({ name: w.name, balance: w.balance });
        }
        
        return { currencies, wallets: walletBalances };
      },
    }),

    // ---------------- Wallets ----------------
    tool({
      name: "walletter_wallets",
      label: "Walletter Wallets",
      description: "List active wallets (full fields).",
      parameters: Type.Object({}),
      execute: async (_p, config) => api<unknown[]>(config, "/wallets"),
    }),
    tool({
      name: "walletter_wallet_get",
      label: "Walletter Wallet Detail",
      description: "Get a single wallet by id.",
      parameters: Type.Object({ id: Type.Number({ description: "Wallet id." }) }),
      execute: async (p, config) => api<unknown>(config, `/wallets/${p.id}`),
    }),
    // ==== COMENDADO: no se usa. La billetera es un activo real; si no existe se le pregunta al usuario. ====
    /* tool({
      name: "walletter_wallet_create",
      label: "Create Wallet",
      description:
        "Create a wallet. name, type and currency required. balance is optional, in units. " +
        "Optional alias, description, icon, color.",
      parameters: Type.Object({
        name: Type.String({ description: "Wallet name." }),
        type: Type.String({ description: "Wallet type, e.g. cash, bank, savings." }),
        currency: Type.String({ description: "Currency code, e.g. USD, VES." }),
        balance: Type.Optional(Type.Number({ description: "Initial balance in units." })),
        alias: Type.Optional(Type.String({ description: "Optional alias." })),
        description: Type.Optional(Type.String({ description: "Optional description." })),
        icon: Type.Optional(Type.String({ description: "Optional icon." })),
        color: Type.Optional(Type.String({ description: "Optional color." })),
      }),
      execute: async (p, config) => {
        const res = await api<unknown>(config, "/wallets", {
          method: "POST",
          body: JSON.stringify({
            name: p.name,
            type: p.type,
            currency: p.currency,
            balance: p.balance,
            alias: p.alias,
            description: p.description,
            icon: p.icon,
            color: p.color,
          }),
        });
        invalidateWalletCache();
        return res;
      },
    }),
    tool({
      name: "walletter_wallet_update",
      label: "Update Wallet",
      description: "Edit a wallet by id. All fields optional.",
      parameters: Type.Object({
        id: Type.Number({ description: "Wallet id." }),
        name: Type.Optional(Type.String({ description: "New name." })),
        alias: Type.Optional(Type.String({ description: "New alias. Pass empty string to clear." })),
        description: Type.Optional(Type.String({ description: "New description." })),
        icon: Type.Optional(Type.String({ description: "New icon." })),
        color: Type.Optional(Type.String({ description: "New color." })),
        type: Type.Optional(Type.String({ description: "New type." })),
        currency: Type.Optional(Type.String({ description: "New currency." })),
        balance: Type.Optional(Type.Number({ description: "New balance in units (reconcile)." })),
      }),
      execute: async (p, config) => {
        const body: Record<string, unknown> = {};
        if (p.name !== undefined) body.name = p.name;
        if (p.alias !== undefined) body.alias = p.alias;
        if (p.description !== undefined) body.description = p.description;
        if (p.icon !== undefined) body.icon = p.icon;
        if (p.color !== undefined) body.color = p.color;
        if (p.type !== undefined) body.type = p.type;
        if (p.currency !== undefined) body.currency = p.currency;
        if (p.balance !== undefined) body.balance = p.balance;
        const res = await api<unknown>(config, `/wallets/${p.id}`, { method: "PUT", body: JSON.stringify(body) });
        invalidateWalletCache();
        return res;
      },
    }),
    tool({
      name: "walletter_wallet_delete",
      label: "Delete Wallet",
      description: "Delete (soft) a wallet by id.",
      parameters: Type.Object({ id: Type.Number({ description: "Wallet id." }) }),
      execute: async (p, config) => {
        const res = await api<unknown>(config, `/wallets/${p.id}`, { method: "DELETE" });
        invalidateWalletCache();
        return res;
      },
    }),
    tool({
      name: "walletter_wallet_reactivate",
      label: "Reactivate Wallet",
      description: "Reactivate a soft-deleted wallet by id.",
      parameters: Type.Object({ id: Type.Number({ description: "Wallet id." }) }),
      execute: async (p, config) => {
        const res = await api<unknown>(config, `/wallets/${p.id}/reactivate`, { method: "PUT" });
        invalidateWalletCache();
        return res;
      },
    }), */


    // ---------------- Categories ----------------
    tool({
      name: "walletter_categories",
      label: "Walletter Categories",
      description: "List categories.",
      parameters: Type.Object({}),
      execute: async (_p, config) => api<unknown[]>(config, "/categories"),
    }),
    tool({
      name: "walletter_category_create",
      label: "Create Category",
      description: "Create a category. name and type required (income|expense). Optional color.",
      parameters: Type.Object({
        name: Type.String({ description: "Category name." }),
        type: Type.String({ description: "income or expense." }),
        color: Type.Optional(Type.String({ description: "Optional color." })),
      }),
      execute: async (p, config) => {
        const res = await api<unknown>(config, "/categories", {
          method: "POST",
          body: JSON.stringify({ name: p.name, type: p.type, color: p.color }),
        });
        invalidateCategoryCache();
        return res;
      },
    }),
    tool({
      name: "walletter_category_update",
      label: "Update Category",
      description: "Edit a category by id. All fields optional.",
      parameters: Type.Object({
        id: Type.Number({ description: "Category id." }),
        name: Type.Optional(Type.String({ description: "New name." })),
        color: Type.Optional(Type.String({ description: "New color." })),
      }),
      execute: async (p, config) => {
        const body: Record<string, unknown> = {};
        if (p.name !== undefined) body.name = p.name;
        if (p.color !== undefined) body.color = p.color;
        const res = await api<unknown>(config, `/categories/${p.id}`, { method: "PUT", body: JSON.stringify(body) });
        invalidateCategoryCache();
        return res;
      },
    }),
    tool({
      name: "walletter_category_delete",
      label: "Delete Category",
      description: "Delete (soft) a category by id.",
      parameters: Type.Object({ id: Type.Number({ description: "Category id." }) }),
      execute: async (p, config) => {
        const res = await api<unknown>(config, `/categories/${p.id}`, { method: "DELETE" });
        invalidateCategoryCache();
        return res;
      },
    }),

    // ---------------- Transactions ----------------
    tool({
      name: "walletter_transactions",
      label: "Walletter Transactions",
      description: "List transactions. Optional filters: walletId, from, to, page, limit.",
      parameters: Type.Object({
        walletId: Type.Optional(Type.Number({ description: "Exact wallet id." })),
        from: Type.Optional(Type.String({ description: "Start date YYYY-MM-DD." })),
        to: Type.Optional(Type.String({ description: "End date YYYY-MM-DD." })),
        page: Type.Optional(Type.Number({ description: "Page number (default 1)." })),
        limit: Type.Optional(Type.Number({ description: "Results per page (default 20, max 100)." })),
      }),
      execute: async (p, config) => {
        const qs = new URLSearchParams();
        if (p.walletId) qs.set("walletId", String(p.walletId));
        if (p.from) qs.set("from", p.from);
        if (p.to) qs.set("to", p.to);
        if (p.page) qs.set("page", String(p.page));
        if (p.limit) qs.set("limit", String(p.limit));
        const q = qs.toString();
        return api<unknown>(config, `/transactions${q ? `?${q}` : ""}`);
      },
    }),
    tool({
      name: "walletter_transaction_get",
      label: "Walletter Transaction Detail",
      description: "Get a single transaction's full detail by id.",
      parameters: Type.Object({ id: Type.Number({ description: "Transaction id." }) }),
      execute: async (p, config) => api<unknown>(config, `/transactions/${p.id}`),
    }),
    tool({
      name: "walletter_transaction_create",
      label: "Create Transaction",
      description:
        "Create a transaction. walletId and categoryName required. amount is in units (e.g. USD dollars) " +
        "and type is expense or income. date YYYY-MM-DD, time HH:MM. Optional fee, description, tz (IANA).",
      parameters: Type.Object({
        walletId: Type.Number({ description: "Wallet id." }),
        categoryName: Type.String({ description: "Category name (created if missing)." }),
        type: Type.String({ description: "expense or income." }),
        amount: Type.Number({ description: "Amount in units (e.g. 25.5)." }),
        description: Type.Optional(Type.String({ description: "Optional description." })),
        fee: Type.Optional(Type.Number({ description: "Optional fee amount in units." })),
        date: Type.String({ description: "YYYY-MM-DD." }),
        time: Type.String({ description: "HH:MM." }),
        tz: Type.Optional(Type.String({ description: "IANA timezone, e.g. America/Caracas." })),
      }),
      execute: async (p, config) => {
        const res = await api<unknown>(config, "/transactions", {
          method: "POST",
          body: JSON.stringify({
            walletId: p.walletId,
            categoryName: p.categoryName,
            type: p.type,
            amount: p.amount,
            description: p.description,
            fee: p.fee ?? 0,
            date: p.date,
            time: p.time,
            tz: p.tz,
          }),
        });
        invalidateWalletCache();
        return res;
      },
    }),
    tool({
      name: "walletter_transaction_update",
      label: "Update Transaction",
      description:
        "Edit a transaction by id. All fields optional, but date and time must be provided together if either is set. " +
        "amount in units. categoryName, description, tz optional.",
      parameters: Type.Object({
        id: Type.Number({ description: "Transaction id." }),
        amount: Type.Optional(Type.Number({ description: "New amount in units." })),
        description: Type.Optional(Type.String({ description: "New description." })),
        date: Type.Optional(Type.String({ description: "YYYY-MM-DD (provide with time)." })),
        time: Type.Optional(Type.String({ description: "HH:MM (provide with date)." })),
        categoryName: Type.Optional(Type.String({ description: "New category name." })),
        tz: Type.Optional(Type.String({ description: "IANA timezone." })),
      }),
      execute: async (p, config) => {
        const body: Record<string, unknown> = {};
        if (p.amount !== undefined) body.amount = p.amount;
        if (p.description !== undefined) body.description = p.description;
        if (p.date !== undefined) body.date = p.date;
        if (p.time !== undefined) body.time = p.time;
        if (p.categoryName !== undefined) body.categoryName = p.categoryName;
        if (p.tz !== undefined) body.tz = p.tz;
        const res = await api<unknown>(config, `/transactions/${p.id}`, { method: "PUT", body: JSON.stringify(body) });
        invalidateWalletCache();
        return res;
      },
    }),
    tool({
      name: "walletter_transaction_delete",
      label: "Delete Transaction",
      description: "Delete (soft) a transaction by id.",
      parameters: Type.Object({ id: Type.Number({ description: "Transaction id." }) }),
      execute: async (p, config) => {
        const res = await api<unknown>(config, `/transactions/${p.id}`, { method: "DELETE" });
        invalidateWalletCache();
        return res;
      },
    }),
    tool({
      name: "walletter_transaction_add_fee",
      label: "Add Transaction Fee",
      description:
        "Add a commission (fee) as an associated child transaction (POST /transactions/:id/fee). " +
        "Deducted from the same wallet. id is the parent transaction id. amount in units, date YYYY-MM-DD, time HH:MM. Optional tz.",
      parameters: Type.Object({
        id: Type.Number({ description: "Parent transaction id." }),
        amount: Type.Number({ description: "Fee amount in units." }),
        date: Type.String({ description: "YYYY-MM-DD." }),
        time: Type.String({ description: "HH:MM." }),
        tz: Type.Optional(Type.String({ description: "IANA timezone, e.g. America/Caracas." })),
      }),
      execute: async (p, config) => {
        const res = await api<unknown>(config, `/transactions/${p.id}/fee`, {
          method: "POST",
          body: JSON.stringify({ amount: p.amount, date: p.date, time: p.time, tz: p.tz }),
        });
        invalidateWalletCache();
        return res;
      },
    }),
    tool({
      name: "walletter_transaction_associate",
      label: "Associate Transaction",
      description:
        "Create an associated (child) transaction linked to an existing parent (POST /transactions/:id/associate). " +
        "id is the parent transaction id. amount in units, type income|expense, categoryName (not system fee/exchange). Optional fee, description, tz.",
      parameters: Type.Object({
        id: Type.Number({ description: "Parent transaction id." }),
        amount: Type.Number({ description: "Amount in units." }),
        type: Type.String({ description: "income or expense." }),
        categoryName: Type.String({ description: "Category name (created if missing; not fee/exchange)." }),
        description: Type.Optional(Type.String({ description: "Optional description." })),
        fee: Type.Optional(Type.Number({ description: "Optional fee amount in units." })),
        date: Type.String({ description: "YYYY-MM-DD." }),
        time: Type.String({ description: "HH:MM." }),
        tz: Type.Optional(Type.String({ description: "IANA timezone, e.g. America/Caracas." })),
      }),
      execute: async (p, config) => {
        const res = await api<unknown>(config, `/transactions/${p.id}/associate`, {
          method: "POST",
          body: JSON.stringify({
            amount: p.amount,
            type: p.type,
            categoryName: p.categoryName,
            description: p.description,
            fee: p.fee ?? 0,
            date: p.date,
            time: p.time,
            tz: p.tz,
          }),
        });
        invalidateWalletCache();
        return res;
      },
    }),

    // ---------------- Exchanges ----------------
    tool({
      name: "walletter_exchanges",
      label: "Walletter Exchanges",
      description: "List currency exchanges. Optional page, limit, period.",
      parameters: Type.Object({
        page: Type.Optional(Type.Number({ description: "Page number." })),
        limit: Type.Optional(Type.Number({ description: "Results per page." })),
        period: Type.Optional(Type.String({ description: "Optional period filter." })),
      }),
      execute: async (p, config) => {
        const qs = new URLSearchParams();
        if (p.page) qs.set("page", String(p.page));
        if (p.limit) qs.set("limit", String(p.limit));
        if (p.period) qs.set("period", p.period);
        const q = qs.toString();
        return api<unknown>(config, `/exchanges${q ? `?${q}` : ""}`);
      },
    }),
    tool({
      name: "walletter_exchange_get",
      label: "Walletter Exchange Detail",
      description: "Get a single exchange by id.",
      parameters: Type.Object({ id: Type.Number({ description: "Exchange id." }) }),
      execute: async (p, config) => api<unknown>(config, `/exchanges/${p.id}`),
    }),
    tool({
      name: "walletter_exchange_create",
      label: "Create Exchange",
      description:
        "Create a currency exchange. fromWalletId/toWalletId and fromAmount/toAmount required (amounts > 0, in units). " +
        "date YYYY-MM-DD, time HH:MM. Optional fee, creditFee, description, tz.",
      parameters: Type.Object({
        fromWalletId: Type.Number({ description: "Source wallet id." }),
        toWalletId: Type.Number({ description: "Destination wallet id." }),
        fromAmount: Type.Number({ description: "Amount from in units (e.g. 100)." }),
        toAmount: Type.Number({ description: "Amount to in units." }),
        description: Type.Optional(Type.String({ description: "Optional description." })),
        fee: Type.Optional(Type.Number({ description: "Optional debit-side fee in units." })),
        creditFee: Type.Optional(Type.Number({ description: "Optional credit-side fee in units." })),
        date: Type.String({ description: "YYYY-MM-DD." }),
        time: Type.String({ description: "HH:MM." }),
        tz: Type.Optional(Type.String({ description: "IANA timezone." })),
      }),
      execute: async (p, config) => {
        const res = await api<unknown>(config, "/exchanges", {
          method: "POST",
          body: JSON.stringify({
            fromWalletId: p.fromWalletId,
            toWalletId: p.toWalletId,
            fromAmount: p.fromAmount,
            toAmount: p.toAmount,
            description: p.description,
            fee: p.fee ?? 0,
            creditFee: p.creditFee ?? 0,
            date: p.date,
            time: p.time,
            tz: p.tz,
          }),
        });
        invalidateWalletCache();
        return res;
      },
    }),
    tool({
      name: "walletter_exchange_update",
      label: "Update Exchange",
      description:
        "Edit an exchange by id. Fields optional. date and time must be provided together if either is set. " +
        "fromAmount/toAmount/fee/creditFee in units.",
      parameters: Type.Object({
        id: Type.Number({ description: "Exchange id." }),
        fromAmount: Type.Optional(Type.Number({ description: "New from amount in units." })),
        toAmount: Type.Optional(Type.Number({ description: "New to amount in units." })),
        fee: Type.Optional(Type.Number({ description: "New fee in units." })),
        creditFee: Type.Optional(Type.Number({ description: "New credit fee in units." })),
        description: Type.Optional(Type.String({ description: "New description." })),
        date: Type.Optional(Type.String({ description: "YYYY-MM-DD (with time)." })),
        time: Type.Optional(Type.String({ description: "HH:MM (with date)." })),
        tz: Type.Optional(Type.String({ description: "IANA timezone." })),
      }),
      execute: async (p, config) => {
        const body: Record<string, unknown> = {};
        if (p.fromAmount !== undefined) body.fromAmount = p.fromAmount;
        if (p.toAmount !== undefined) body.toAmount = p.toAmount;
        if (p.fee !== undefined) body.fee = p.fee;
        if (p.creditFee !== undefined) body.creditFee = p.creditFee;
        if (p.description !== undefined) body.description = p.description;
        if (p.date !== undefined) body.date = p.date;
        if (p.time !== undefined) body.time = p.time;
        if (p.tz !== undefined) body.tz = p.tz;
        const res = await api<unknown>(config, `/exchanges/${p.id}`, { method: "PUT", body: JSON.stringify(body) });
        invalidateWalletCache();
        return res;
      },
    }),
    tool({
      name: "walletter_exchange_delete",
      label: "Delete Exchange",
      description: "Delete (soft) an exchange by id.",
      parameters: Type.Object({ id: Type.Number({ description: "Exchange id." }) }),
      execute: async (p, config) => {
        const res = await api<unknown>(config, `/exchanges/${p.id}`, { method: "DELETE" });
        invalidateWalletCache();
        return res;
      },
    }),

    // ---------------- Rates ----------------
    tool({
      name: "walletter_rates",
      label: "Walletter Rates",
      description:
        "Get the effective daily rate (BCV and parallel, VES per USD). Pass date as YYYY-MM-DD, or omit it for today.",
      parameters: Type.Object({
        date: Type.Optional(Type.String({ description: "Date as YYYY-MM-DD. Omit to use today." })),
      }),
      execute: async (p, config) => {
        const q = p.date ? `?date=${encodeURIComponent(p.date)}` : "";
        return api<unknown>(config, `/rates/effective${q}`);
      },
    }),

    // ---------------- Recurring ----------------
    tool({
      name: "walletter_recurring",
      label: "Walletter Recurring",
      description: "List recurring payments.",
      parameters: Type.Object({}),
      execute: async (_p, config) => api<unknown[]>(config, "/recurring-payments"),
    }),
    tool({
      name: "walletter_recurring_get",
      label: "Walletter Recurring Detail",
      description: "Get a single recurring payment by id.",
      parameters: Type.Object({ id: Type.Number({ description: "Recurring payment id." }) }),
      execute: async (p, config) => api<unknown>(config, `/recurring-payments/${p.id}`),
    }),
    tool({
      name: "walletter_recurring_create",
      label: "Create Recurring Payment",
      description:
        "Create a recurring payment. name, amount, currency and type required. Optional categoryName/categoryId, walletId, fee, description.",
      parameters: Type.Object({
        name: Type.String({ description: "Recurring name." }),
        description: Type.Optional(Type.String({ description: "Optional description." })),
        amount: Type.Number({ description: "Amount in units." }),
        fee: Type.Optional(Type.Number({ description: "Optional fee in units." })),
        currency: Type.String({ description: "Currency code, e.g. USD." }),
        type: Type.String({ description: "income or expense." }),
        categoryName: Type.Optional(Type.String({ description: "Category name." })),
        categoryId: Type.Optional(Type.Number({ description: "Category id (alternative to name)." })),
        walletId: Type.Optional(Type.Number({ description: "Default wallet id." })),
      }),
      execute: async (p, config) => {
        const res = await api<unknown>(config, "/recurring-payments", {
          method: "POST",
          body: JSON.stringify({
            name: p.name,
            description: p.description,
            amount: p.amount,
            fee: p.fee ?? 0,
            currency: p.currency,
            type: p.type,
            categoryName: p.categoryName,
            categoryId: p.categoryId,
            walletId: p.walletId,
          }),
        });
        return res;
      },
    }),
    tool({
      name: "walletter_recurring_execute",
      label: "Execute Recurring Payment",
      description:
        "Execute a recurring payment, generating a real transaction. date YYYY-MM-DD, time HH:MM, tz optional. " +
        "Optional overrideAmount, overrideFee, overrideCategoryName, overrideWalletId, description.",
      parameters: Type.Object({
        id: Type.Number({ description: "Recurring payment id." }),
        date: Type.String({ description: "YYYY-MM-DD." }),
        time: Type.String({ description: "HH:MM." }),
        tz: Type.Optional(Type.String({ description: "IANA timezone." })),
        walletId: Type.Optional(Type.Number({ description: "Target wallet id (default of the recurring)." })),
        overrideAmount: Type.Optional(Type.Number({ description: "Override amount in units." })),
        overrideFee: Type.Optional(Type.Number({ description: "Override fee in units." })),
        overrideCategoryName: Type.Optional(Type.String({ description: "Override category name." })),
        overrideWalletId: Type.Optional(Type.Number({ description: "Override wallet id." })),
        description: Type.Optional(Type.String({ description: "Optional description." })),
      }),
      execute: async (p, config) => {
        const res = await api<unknown>(config, `/recurring-payments/${p.id}/execute`, {
          method: "POST",
          body: JSON.stringify({
            date: p.date,
            time: p.time,
            tz: p.tz,
            walletId: p.walletId,
            overrideAmount: p.overrideAmount,
            overrideFee: p.overrideFee,
            overrideCategoryName: p.overrideCategoryName,
            overrideWalletId: p.overrideWalletId,
            description: p.description,
          }),
        });
        invalidateWalletCache();
        return res;
      },
    }),
    tool({
      name: "walletter_recurring_update",
      label: "Update Recurring Payment",
      description: "Edit a recurring payment by id. All fields optional.",
      parameters: Type.Object({
        id: Type.Number({ description: "Recurring payment id." }),
        name: Type.Optional(Type.String({ description: "New name." })),
        description: Type.Optional(Type.String({ description: "New description." })),
        amount: Type.Optional(Type.Number({ description: "New amount in units." })),
        fee: Type.Optional(Type.Number({ description: "New fee in units." })),
        currency: Type.Optional(Type.String({ description: "New currency." })),
        type: Type.Optional(Type.String({ description: "income or expense." })),
        categoryName: Type.Optional(Type.String({ description: "New category name." })),
        walletId: Type.Optional(Type.Number({ description: "New default wallet id." })),
      }),
      execute: async (p, config) => {
        const body: Record<string, unknown> = {};
        if (p.name !== undefined) body.name = p.name;
        if (p.description !== undefined) body.description = p.description;
        if (p.amount !== undefined) body.amount = p.amount;
        if (p.fee !== undefined) body.fee = p.fee;
        if (p.currency !== undefined) body.currency = p.currency;
        if (p.type !== undefined) body.type = p.type;
        if (p.categoryName !== undefined) body.categoryName = p.categoryName;
        if (p.walletId !== undefined) body.walletId = p.walletId;
        const res = await api<unknown>(config, `/recurring-payments/${p.id}`, { method: "PUT", body: JSON.stringify(body) });
        return res;
      },
    }),
    tool({
      name: "walletter_recurring_delete",
      label: "Delete Recurring Payment",
      description: "Delete a recurring payment by id.",
      parameters: Type.Object({ id: Type.Number({ description: "Recurring payment id." }) }),
      execute: async (p, config) => {
        const res = await api<unknown>(config, `/recurring-payments/${p.id}`, { method: "DELETE" });
        return res;
      },
    }),

    // ---------------- Stats & Reports ----------------
    tool({
      name: "walletter_stats",
      label: "Walletter Stats",
      description: "Get finance statistics (overview and by-category).",
      parameters: Type.Object({
        byCategory: Type.Optional(Type.Boolean({ description: "Return stats broken down by category instead." })),
      }),
      execute: async (p, config) =>
        p.byCategory ? api<unknown>(config, "/stats/by-category") : api<unknown>(config, "/stats"),
    }),
    tool({
      name: "walletter_reports",
      label: "Walletter Reports",
      description:
        "Get a finance report overview. Optional period, rate and tz (IANA) query parameters.",
      parameters: Type.Object({
        period: Type.Optional(Type.String({ description: "Period filter, e.g. month." })),
        rate: Type.Optional(Type.String({ description: "Rate to use, e.g. bcv or paralelo." })),
        tz: Type.Optional(Type.String({ description: "IANA timezone, e.g. America/Caracas." })),
      }),
      execute: async (p, config) => {
        const qs = new URLSearchParams();
        if (p.period) qs.set("period", p.period);
        if (p.rate) qs.set("rate", p.rate);
        if (p.tz) qs.set("tz", p.tz);
        const q = qs.toString();
        return api<unknown>(config, `/reports${q ? `?${q}` : ""}`);
      },
    }),
  ],
});
