/**
 * Appended to `nexus deployment template attach`: the three nested template-group
 * objects reach the operator only as `--*-group <json>`.
 */

export const TEMPLATE_ATTACH_NOTES = `
Examples:
  $ nexus deployment template attach 11111111-1111-4111-8111-111111111111 --template-id HX456 --name welcome --description "Welcome message"
  $ nexus deployment template attach 11111111-1111-4111-8111-111111111111 --template-id HX456 --name order --description "Order confirmation" --variables '{"1":{"description":"Customer name","isBodyVariable":true}}'
  $ nexus deployment template attach 11111111-1111-4111-8111-111111111111 --template-id HX456 --name products --description "Product carousel" --type carousel --enable-dynamic-size --carousel-template-group '{"baseName":"products","availableTemplates":[{"language":"en","carouselSize":3,"templateId":"HX111"},{"language":"en","carouselSize":5,"templateId":"HX222"}],"minCarouselSize":3,"maxCarouselSize":5}'
  $ nexus deployment template attach 11111111-1111-4111-8111-111111111111 --template-id HX456 --name welcome --description "Welcome message" --enable-multi-language --template-group '{"baseName":"welcome","availableLanguages":[{"language":"en","templateId":"HX456"},{"language":"fr","templateId":"HX789"}],"defaultLanguage":"en"}'

Notes:
  --enable-multi-language ON ITS OWN CHANGES NOTHING AT SEND TIME. The setting
  is the switch; --template-group is the per-language map it reads. A standard
  template with the switch on and no group resolves no language and fails when
  the agent sends. Name both, in the same command.
  --template-group is the STANDARD-template map (baseName, availableLanguages,
  defaultLanguage). --carousel-template-group is the carousel one. Naming BOTH
  is a 400 — they are mutually exclusive.
  A DRAFT OR REJECTED TEMPLATE ATTACHES WITHOUT AN ERROR. Approval is not
  checked here; the failure arrives when the agent sends. Confirm with
  "nexus channel whatsapp-template approvals" first.
  --template-id is the Twilio content SID (HX...), not the friendly name.
  --description is REQUIRED and is not decoration — it is what the agent reads
  to decide when to use this template.
  Each --variables entry is keyed by the {{N}} position:
  '{"1":{"description":"Customer name","isBodyVariable":true}}'. The
  description tells the agent what to put there.
  The four carousel options (--enable-dynamic-size, --carousel-template-group,
  --single-item-card-template-id, --single-item-card-template-group) are a 400
  unless --type carousel. They are not ignored.
  Attaching a template id that is already attached is a 409 — use
  "deployment template update" to change one.`;
