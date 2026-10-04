import type { Command } from "commander";

import { registerEvalConvAcceptCommand } from "./accept.command";
import { registerEvalConvAddUserCommand } from "./add-user.command";
import { registerEvalConvCheckpointCommand } from "./checkpoint.command";
import { registerEvalConvCreateCommand } from "./create.command";
import { registerEvalConvDeleteCommand } from "./delete.command";
import { registerEvalConvGenerateCommand } from "./generate.command";
import { registerEvalConvGetCommand } from "./get.command";
import { registerEvalConvListCommand } from "./list.command";
import { registerEvalConvNewCommand } from "./new.command";
import { registerEvalConvReadyCommand } from "./ready.command";
import { registerEvalConvSetGoldenCommand } from "./set-golden.command";

/** Registers every `nexus eval conv` leaf, in registration order. */
export function registerEvalConvCommands(conv: Command, program: Command): void {
  registerEvalConvCreateCommand(conv, program);
  registerEvalConvListCommand(conv, program);
  registerEvalConvGetCommand(conv, program);
  registerEvalConvDeleteCommand(conv, program);
  registerEvalConvAddUserCommand(conv, program);
  registerEvalConvGenerateCommand(conv, program);
  registerEvalConvAcceptCommand(conv, program);
  registerEvalConvSetGoldenCommand(conv, program);
  registerEvalConvCheckpointCommand(conv, program);
  registerEvalConvReadyCommand(conv, program);
  registerEvalConvNewCommand(conv, program);
}
