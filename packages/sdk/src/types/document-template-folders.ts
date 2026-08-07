// ============================================================================
// Document template folder (response shape)
// ============================================================================

/** A folder for organizing document templates. Folders can be nested via `parentId`. */
export interface DocumentTemplateFolder {
  /** Unique folder UUID. */
  id: string;
  /** Folder display name. */
  name: string;
  /** URL to the folder's icon. */
  iconUrl: string | null;
  /** Parent folder UUID for nesting, or `null` for root-level folders. */
  parentId: string | null;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-updated timestamp. */
  updatedAt: string | null;
}

// ============================================================================
// Assignment
// ============================================================================

/** Represents a document template's assignment to a folder. */
export interface DocumentTemplateFolderAssignment {
  /**
   * Document template id.
   *
   * The assignment row stores this as a bare string column with no foreign key,
   * so a historical row can hold a value that is not a well-formed UUID.
   */
  templateId: string;
  /** Folder UUID the template is assigned to. */
  folderId: string;
}

// ============================================================================
// List response
// ============================================================================

/** Response from `client.documentTemplateFolders.list()`. */
export interface ListDocumentTemplateFoldersResponse {
  /** All document template folders in the organization. */
  folders: DocumentTemplateFolder[];
  /** All template-to-folder assignments. */
  assignments: DocumentTemplateFolderAssignment[];
}

// ============================================================================
// Request bodies
// ============================================================================

/** Request body for `client.documentTemplateFolders.create()`. */
export interface CreateDocumentTemplateFolderBody {
  /** Folder display name (required). */
  name: string;
  /** Parent folder UUID for nesting. Omit for a root-level folder. */
  parentId?: string;
}

/** Request body for `client.documentTemplateFolders.update()`. All fields are optional. */
export interface UpdateDocumentTemplateFolderBody {
  /** New folder display name. */
  name?: string;
  /** New parent folder UUID. Set to `null` to move to root level. */
  parentId?: string | null;
}

/** Request body for `client.documentTemplateFolders.assign()`. */
export interface AssignTemplateToFolderBody {
  /** Document template UUID to assign. */
  templateId: string;
  /** Target folder UUID, or `null` to remove the template from its folder. */
  folderId: string | null;
}

// ============================================================================
// Assign response
// ============================================================================

/** Response from `client.documentTemplateFolders.assign()`. */
export interface AssignTemplateToFolderResponse {
  /** Document template id, as stored on the assignment row. */
  templateId: string;
  /** Folder UUID the template was assigned to, or `null` if removed. */
  folderId: string | null;
  /** Whether the assignment was applied. */
  assigned: boolean;
}
