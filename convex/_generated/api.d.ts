/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai from "../ai.js";
import type * as aiBreakdown from "../aiBreakdown.js";
import type * as aiChatActions from "../aiChatActions.js";
import type * as aiChats from "../aiChats.js";
import type * as aiLinkScraper from "../aiLinkScraper.js";
import type * as archivedDates from "../archivedDates.js";
import type * as backlogLabel from "../backlogLabel.js";
import type * as dateLabels from "../dateLabels.js";
import type * as dates from "../dates.js";
import type * as folders from "../folders.js";
import type * as fullPageNotes from "../fullPageNotes.js";
import type * as http from "../http.js";
import type * as monthGroups from "../monthGroups.js";
import type * as notes from "../notes.js";
import type * as pomodoro from "../pomodoro.js";
import type * as search from "../search.js";
import type * as stats from "../stats.js";
import type * as streaks from "../streaks.js";
import type * as todos from "../todos.js";
import type * as unsplash from "../unsplash.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  aiBreakdown: typeof aiBreakdown;
  aiChatActions: typeof aiChatActions;
  aiChats: typeof aiChats;
  aiLinkScraper: typeof aiLinkScraper;
  archivedDates: typeof archivedDates;
  backlogLabel: typeof backlogLabel;
  dateLabels: typeof dateLabels;
  dates: typeof dates;
  folders: typeof folders;
  fullPageNotes: typeof fullPageNotes;
  http: typeof http;
  monthGroups: typeof monthGroups;
  notes: typeof notes;
  pomodoro: typeof pomodoro;
  search: typeof search;
  stats: typeof stats;
  streaks: typeof streaks;
  todos: typeof todos;
  unsplash: typeof unsplash;
  users: typeof users;
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
