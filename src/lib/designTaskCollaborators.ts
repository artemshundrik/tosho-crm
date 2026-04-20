export type DesignTaskCollaborator = {
  userId: string;
  label: string;
  avatarUrl: string | null;
};

type MetadataLike = Record<string, unknown> | null | undefined;

type CollaboratorMetadataOptions = {
  assigneeUserId?: string | null;
  resolveLabel: (userId: string) => string;
  resolveAvatar?: (userId: string) => string | null | undefined;
};

const toNonEmptyString = (value: unknown) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
};

const toStringMap = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {} as Record<string, string>;
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, entryValue]) => {
    const normalizedKey = toNonEmptyString(key);
    const normalizedValue = toNonEmptyString(entryValue);
    if (normalizedKey && normalizedValue) acc[normalizedKey] = normalizedValue;
    return acc;
  }, {});
};

export const getDesignTaskCollaboratorIds = (metadata?: MetadataLike, assigneeUserId?: string | null) => {
  const raw = metadata?.collaborator_user_ids;
  if (!Array.isArray(raw)) return [] as string[];
  const ids = raw
    .map((value) => toNonEmptyString(value))
    .filter((value): value is string => !!value);
  return Array.from(new Set(ids)).filter((value) => value !== assigneeUserId);
};

export const getDesignTaskCollaboratorLabelMap = (metadata?: MetadataLike) => toStringMap(metadata?.collaborator_labels);

export const getDesignTaskCollaboratorAvatarMap = (metadata?: MetadataLike) => toStringMap(metadata?.collaborator_avatar_urls);

export const resolveDesignTaskCollaborators = (
  metadata: MetadataLike,
  options: CollaboratorMetadataOptions
): DesignTaskCollaborator[] => {
  const ids = getDesignTaskCollaboratorIds(metadata, options.assigneeUserId);
  const labelMap = getDesignTaskCollaboratorLabelMap(metadata);
  const avatarMap = getDesignTaskCollaboratorAvatarMap(metadata);
  return ids.map((userId) => ({
    userId,
    label: labelMap[userId] ?? options.resolveLabel(userId),
    avatarUrl: avatarMap[userId] ?? options.resolveAvatar?.(userId) ?? null,
  }));
};

export const withDesignTaskCollaboratorMetadata = (
  metadata: MetadataLike,
  collaboratorUserIds: string[],
  options: CollaboratorMetadataOptions
): Record<string, unknown> => {
  const ids = Array.from(
    new Set(
      collaboratorUserIds
        .map((value) => toNonEmptyString(value))
        .filter((value): value is string => !!value && value !== options.assigneeUserId)
    )
  );

  const collaboratorLabels: Record<string, string> = {};
  const collaboratorAvatarUrls: Record<string, string> = {};

  ids.forEach((userId) => {
    const label = toNonEmptyString(options.resolveLabel(userId));
    if (label) collaboratorLabels[userId] = label;

    const avatarUrl = toNonEmptyString(options.resolveAvatar?.(userId) ?? null);
    if (avatarUrl) collaboratorAvatarUrls[userId] = avatarUrl;
  });

  return {
    ...(metadata ?? {}),
    collaborator_user_ids: ids,
    collaborator_labels: collaboratorLabels,
    collaborator_avatar_urls: collaboratorAvatarUrls,
  };
};
