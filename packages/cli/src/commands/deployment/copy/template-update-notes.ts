/**
 * Appended to `nexus deployment template update`: what a template update may and
 * may not change once Meta has approved it.
 */

export const TEMPLATE_UPDATE_NOTES = `
Examples:
  $ nexus deployment template update 11111111-1111-4111-8111-111111111111 HX456 --name "Updated Welcome"
  $ nexus deployment template update 11111111-1111-4111-8111-111111111111 HX456 --variables '{"1":{"description":"Full name"}}'
  $ nexus deployment template update 11111111-1111-4111-8111-111111111111 HX456 --enable-dynamic-size --carousel-template-group '{"baseName":"products","availableTemplates":[...]}'
  $ nexus deployment template update 11111111-1111-4111-8111-111111111111 HX456 --enable-multi-language --template-group '{"baseName":"welcome","availableLanguages":[{"language":"en","templateId":"HX456"},{"language":"fr","templateId":"HX789"}],"defaultLanguage":"en"}'

Notes:
  --enable-multi-language ON ITS OWN CHANGES NOTHING AT SEND TIME. It is the
  switch; --template-group is the per-language map a standard template reads.
  Turning the switch on without a group leaves the template unable to resolve
  any language.
  --template-group REPLACES the whole group, exactly as --variables replaces the
  whole map. --carousel-template-group is the carousel sibling; the two are
  mutually exclusive.
  --variables REPLACES the whole map, it does not merge one key in. Read
  "deployment template list 11111111-1111-4111-8111-111111111111 --json" and
  send the complete map back.
  A template id that is not attached to this deployment is a 404, not a
  silent create.
  Each setting has an ON flag and an OFF flag: --enable-multi-language /
  --no-multi-language, and --enable-dynamic-size / --no-dynamic-size. Naming
  neither leaves the stored value alone. Naming BOTH is refused, because the
  two spellings carry no order and this command will not guess.
  Sending nothing is accepted and changes nothing.`;
