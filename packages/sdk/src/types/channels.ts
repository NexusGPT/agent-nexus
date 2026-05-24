export interface ChannelSetupStep {
  step: number;
  name: string;
  label: string;
  status: "completed" | "action_needed" | "pending" | "error";
  description: string;
  resource?: { id: string; name: string };
  action?: { method: string; endpoint: string; hint?: string };
  error?: string;
}

export interface ChannelSetupResponse {
  type: string;
  ready: boolean;
  steps: ChannelSetupStep[];
}

export interface Connection {
  id: string;
  name: string;
  description: string | null;
  accountSid: string;
  region: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConnectionBody {
  region?: "us1" | "ie1";
}

export interface WhatsAppSender {
  id: string;
  senderId: string;
  name: string;
  wabaId: string;
  phoneNumberId: string;
  phoneNumber?: {
    id: string;
    number: string;
    friendlyName: string | null;
    countryCode: string;
  };
  status?: "OFFLINE" | "ONLINE";
}

export interface CreateWhatsAppSenderBody {
  connectionId: string;
  phoneNumberId: string;
  senderName: string;
  wabaId?: string;
}

export interface AutoProvisionBody {
  type: string;
  region?: "us1" | "ie1";
}

// ===========================================================================
// WhatsApp Templates
// ===========================================================================

export interface WhatsAppTemplate {
  id: string;
  friendly_name: string | null;
  language: string;
  types: Record<string, unknown>;
  variables?: Record<string, string>;
  approval_fetch?: unknown;
  created_at?: string;
  updated_at?: string;
}

export interface CreateWhatsAppTemplateBody {
  connectionId: string;
  friendlyName: string;
  language: string;
  types: Record<string, unknown>;
  variables?: Record<string, string>;
}

export interface TemplateApproval {
  sid: string;
  approvalRequests: {
    allow_category_change: boolean;
    category: string;
    content_type: string;
    name: string;
    rejection_reason: string;
    status: string;
  };
}

export interface SubmitTemplateApprovalBody {
  connectionId: string;
  templateId: string;
  name: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
}

export interface SubmitTemplateApprovalResponse {
  sid: string;
  status: string;
}

// ===========================================================================
// Deployment WhatsApp Templates
// ===========================================================================

export interface DeploymentTemplateVariable {
  description: string;
  displayName?: string;
  isBodyVariable?: boolean;
  cardIndex?: number;
}

export interface DeploymentTemplateGroup {
  baseName: string;
  availableLanguages: Array<{ language: string; templateId: string }>;
  defaultLanguage?: string;
}

export interface DeploymentCarouselTemplateGroup {
  baseName: string;
  availableTemplates: Array<{ language: string; carouselSize: number; templateId: string }>;
  defaultLanguage?: string;
  minCarouselSize?: number;
  maxCarouselSize?: number;
}

export interface DeploymentSingleItemCardTemplateGroup {
  availableTemplates: Array<{ language: string; templateId: string }>;
}

export interface WhatsAppTemplateMessage {
  templateId: string;
  name: string;
  description: string;
  variables: Record<string, DeploymentTemplateVariable>;
  type?: "template" | "card" | "carousel";
  enableMultiLanguage?: boolean;
  templateGroup?: DeploymentTemplateGroup;
  // Carousel-specific fields
  enableDynamicSize?: boolean;
  carouselTemplateGroup?: DeploymentCarouselTemplateGroup;
  singleItemCardTemplateId?: string;
  singleItemCardTemplateGroup?: DeploymentSingleItemCardTemplateGroup;
}

export interface AttachWhatsAppTemplateBody {
  templateId: string;
  name: string;
  description: string;
  variables?: Record<string, DeploymentTemplateVariable>;
  type?: "template" | "card" | "carousel";
  enableMultiLanguage?: boolean;
  templateGroup?: DeploymentTemplateGroup;
  // Carousel-specific fields (only valid when type = "carousel")
  enableDynamicSize?: boolean;
  carouselTemplateGroup?: DeploymentCarouselTemplateGroup;
  singleItemCardTemplateId?: string;
  singleItemCardTemplateGroup?: DeploymentSingleItemCardTemplateGroup;
}

// ===========================================================================
// WhatsApp Template Test-Send
// ===========================================================================

export interface TestSendWhatsAppTemplateBody {
  connectionId: string;
  to: string;
  variables?: Record<string, string>;
}

export interface TestSendWhatsAppTemplateResponse {
  messageSid: string;
  status: string;
  to: string;
  from: string;
  sentAt: string;
}

export interface GetTestSendStatusResponse {
  messageSid: string;
  status: string;
  errorCode?: number;
  errorMessage?: string;
}

export interface UpdateDeploymentTemplateBody {
  name?: string;
  description?: string;
  variables?: Record<string, DeploymentTemplateVariable>;
  enableMultiLanguage?: boolean;
  templateGroup?: DeploymentTemplateGroup;
  // Carousel-specific fields
  enableDynamicSize?: boolean;
  carouselTemplateGroup?: DeploymentCarouselTemplateGroup;
  singleItemCardTemplateId?: string;
  singleItemCardTemplateGroup?: DeploymentSingleItemCardTemplateGroup;
}
