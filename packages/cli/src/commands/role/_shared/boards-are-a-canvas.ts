export const BOARDS_ARE_A_CANVAS = `
  A BOARD CARRIES NO PERMISSION AND NO EXECUTION MEANING. Moving a card changes
  where it is DRAWN on the Overview screen and changes nothing about what the
  Role can reach or what runs. Use "nexus role attach"/"detach" for holdings and
  the permission-set verbs for authority.
  Needs role_boards:read to look and role_boards:write to change, plus the
  Role's own board.view / board.manage capability — a scope alone is not enough.`;
