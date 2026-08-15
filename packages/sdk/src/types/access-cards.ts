// ============================================================================
// Access Card types
// ============================================================================

export interface AccessCardCreator {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

export interface AccessCard {
  id: string;
  credentialId: string;
  name: string;
  description: string | null;
  isMaster: boolean;
  policies: Record<string, ActionPolicy>;
  variables: CardVariable[];
  color: string;
  createdBy: AccessCardCreator | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActionPolicy {
  parameters?: Record<string, ParameterPolicy>;
}

export interface ParameterPolicy {
  enabled: boolean;
  value?: string;
  /** What a consumer's value for this parameter is allowed to be. */
  constraint?: CardVariableConstraint;
}

/**
 * The bound an access card puts on a value a consumer supplies.
 *
 * This is a SECURITY CONTROL, not a hint: it is the card's statement of what a
 * caller may put in a variable or a policy parameter, and the server both stores
 * and returns it. It was absent from this package entirely — on `CardVariable`
 * AND on `ParameterPolicy` — so the constraint could be set through the CLI's
 * `--body` path and was unreadable from every typed consumer of the SDK, in both
 * directions (NEX-3867).
 */
export interface CardVariableConstraint {
  /** Regular expression the value must match. */
  pattern?: string;
  /** Closed set of permitted values. */
  enum?: string[];
  /** Maximum length of the value. */
  maxLength?: number;
  /** Named format the value must parse as. */
  format?: "uuid" | "email" | "uri" | "date-time" | "e164";
}

export interface CardVariable {
  name: string;
  title: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  description?: string;
  required?: boolean;
  /** What a consumer's value for this variable is allowed to be. */
  constraint?: CardVariableConstraint;
}

// ============================================================================
// Request bodies
// ============================================================================

export interface CreateAccessCardBody {
  name: string;
  description?: string | null;
  policies: Record<string, ActionPolicy>;
  variables?: CardVariable[];
  color?: string;
}

export interface UpdateAccessCardBody {
  name?: string;
  description?: string | null;
  policies?: Record<string, ActionPolicy>;
  variables?: CardVariable[];
  color?: string;
}

// ============================================================================
// Delete response
// ============================================================================

export interface DeleteAccessCardResponse {
  deleted: true;
}

// ============================================================================
// Available Actions
// ============================================================================

export interface ParameterDefinition {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface ActionDefinition {
  actionId: string;
  name: string;
  description: string;
  componentType?: "action" | "source";
  parameters: ParameterDefinition[];
}

export interface AvailableActionsResponse {
  actions: ActionDefinition[];
}
