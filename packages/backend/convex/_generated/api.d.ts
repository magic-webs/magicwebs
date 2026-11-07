/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as apiKeys from "../apiKeys.js";
import type * as auth from "../auth.js";
import type * as chats from "../chats.js";
import type * as cloudflare from "../cloudflare.js";
import type * as dashboard from "../dashboard.js";
import type * as domains from "../domains.js";
import type * as drafts from "../drafts.js";
import type * as edge from "../edge.js";
import type * as edgeData from "../edgeData.js";
import type * as http from "../http.js";
import type * as jobs from "../jobs.js";
import type * as leads from "../leads.js";
import type * as lib from "../lib.js";
import type * as magicAgent from "../magicAgent.js";
import type * as migrations from "../migrations.js";
import type * as models from "../models.js";
import type * as pages from "../pages.js";
import type * as projects from "../projects.js";
import type * as rebuilds from "../rebuilds.js";
import type * as users from "../users.js";
import type * as versions from "../versions.js";
import type * as widget from "../widget.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  apiKeys: typeof apiKeys;
  auth: typeof auth;
  chats: typeof chats;
  cloudflare: typeof cloudflare;
  dashboard: typeof dashboard;
  domains: typeof domains;
  drafts: typeof drafts;
  edge: typeof edge;
  edgeData: typeof edgeData;
  http: typeof http;
  jobs: typeof jobs;
  leads: typeof leads;
  lib: typeof lib;
  magicAgent: typeof magicAgent;
  migrations: typeof migrations;
  models: typeof models;
  pages: typeof pages;
  projects: typeof projects;
  rebuilds: typeof rebuilds;
  users: typeof users;
  versions: typeof versions;
  widget: typeof widget;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
