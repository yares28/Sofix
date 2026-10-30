/** Non-secret installation identity. No original-owner fallback is safe for a clone. */
export function repositoryFromRemote(remote) {
  return remote.trim().match(/^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?$/)?.[1] ?? null;
}

export function vercelProject(env, linked = {}) {
  const team = env.VERCEL_ORG_ID || linked.orgId;
  const project = env.VERCEL_PROJECT_ID || linked.projectId;
  return typeof team === "string" && typeof project === "string" && team && project ? { team, project } : null;
}
