import path from 'node:path';
import fs from 'fs-extra';

export const VIBEFLOW_DIR_NAME = '.ai-dev';
export const WORKFLOW_DOCS_DIR = path.join('docs', 'ai-workflow');

export function resolveProjectRoot(cwd: string = process.cwd()): string {
  return path.resolve(cwd);
}

export function getVibeflowDir(projectRoot: string): string {
  return path.join(projectRoot, VIBEFLOW_DIR_NAME);
}

export function getWorkflowDocsDir(projectRoot: string): string {
  return path.join(projectRoot, WORKFLOW_DOCS_DIR);
}

export function getFeatureDir(projectRoot: string, featureName: string): string {
  return path.join(getWorkflowDocsDir(projectRoot), featureName);
}

export async function isVibeflowProject(projectRoot: string): Promise<boolean> {
  return fs.pathExists(path.join(getVibeflowDir(projectRoot), 'config.yaml'));
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9一-龥-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
