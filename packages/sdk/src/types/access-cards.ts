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
}

export interface CardVariable {
  name: string;
  title: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  description?: string;
  required?: boolean;
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
