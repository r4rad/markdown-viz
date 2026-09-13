/** Re-export pure ACL helpers from the shared domain package. */
export {
  canReadWorkspace,
  canWriteWorkspace,
  canCommentWorkspace,
  canManageMembers,
  canRestoreVersion,
  canSyncWiki,
  canReadActivity,
  canQueryWorkspaceActivity,
  activityCreateAllowed,
  isWorkspaceMember,
} from '@markdown-viz/domain';
