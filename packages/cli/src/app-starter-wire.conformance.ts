/**
 * THE DRIFT GATE for the app-starter download's wire constants.
 *
 * `commands/apps/starter/wire.ts` cannot import `@nexus/types` at runtime (the CLI
 * is published standalone), so it declares the route's response-header names
 * itself. Each assertion below is a compile error the moment a CLI constant
 * stops being the exact literal the contract declares — a renamed header would
 * otherwise print "?" for a version and fail nothing.
 *
 * Compiled, never bundled: `src/index.ts` cannot reach this module.
 */
import type * as NexusTypes from "@nexus/types";

import {
  APP_STARTER_UI_VERSION_HEADER,
  APP_STARTER_VERSION_HEADER
} from "./commands/apps/starter/wire";

const versionHeader: typeof NexusTypes.VIBE_APP_STARTER_VERSION_HEADER = APP_STARTER_VERSION_HEADER;
const uiVersionHeader: typeof NexusTypes.VIBE_APP_STARTER_UI_VERSION_HEADER =
  APP_STARTER_UI_VERSION_HEADER;
export const APP_STARTER_WIRE_CONFORMS = [versionHeader, uiVersionHeader] as const;
