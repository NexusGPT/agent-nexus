export interface SkillFolder {
  id: string;
  name: string;
  iconUrl: string | null;
  parentId: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface SkillFolderAssignment {
  skillId: string;
  folderId: string;
}

export interface ListSkillFoldersResponse {
  folders: SkillFolder[];
  assignments: SkillFolderAssignment[];
}

export interface CreateSkillFolderBody {
  name: string;
  parentId?: string;
}

export interface UpdateSkillFolderBody {
  name?: string;
  parentId?: string | null;
}

export interface AssignSkillToFolderBody {
  skillId: string;
  folderId: string | null;
}

export interface AssignSkillToFolderResponse {
  skillId: string;
  folderId: string | null;
  assigned: boolean;
}
