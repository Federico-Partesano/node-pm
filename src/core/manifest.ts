import fs from 'node:fs/promises';
import path from 'node:path';
import writeFileAtomic from 'write-file-atomic';
import { ManifestSchema, type Manifest, type Project } from '../shared/types.js';
import { ManifestError } from '../shared/errors.js';
import { getManifestPath, getDefaultRoot, expandHome, getConfigDir } from '../shared/paths.js';

export class ManifestStore {
  private cache: Manifest | null = null;

  async load(): Promise<Manifest> {
    if (this.cache) return this.cache;
    const p = getManifestPath();
    let raw: string;
    try {
      raw = await fs.readFile(p, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.cache = ManifestSchema.parse({
          version: 1,
          root: getDefaultRoot(),
          concurrency: 5,
          projects: [],
        });
        return this.cache;
      }
      throw new ManifestError(
        `Cannot read manifest: ${(err as Error).message}`,
        'E_MANIFEST_READ',
        err as Error,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      const bak = `${p}.bak.${Date.now()}`;
      await fs.copyFile(p, bak).catch(() => {});
      throw new ManifestError(
        `Manifest is not valid JSON. Backup written to ${bak}`,
        'E_MANIFEST_PARSE',
        err as Error,
      );
    }
    const result = ManifestSchema.safeParse(parsed);
    if (!result.success) {
      throw new ManifestError(
        `Manifest schema invalid: ${result.error.message}`,
        'E_MANIFEST_SCHEMA',
      );
    }
    this.cache = result.data;
    return this.cache;
  }

  async save(m: Manifest): Promise<void> {
    const validated = ManifestSchema.parse(m);
    const p = getManifestPath();
    await fs.mkdir(getConfigDir(), { recursive: true });
    await writeFileAtomic(p, JSON.stringify(validated, null, 2));
    this.cache = validated;
  }

  async addProject(p: Project): Promise<void> {
    const m = await this.load();
    const idx = m.projects.findIndex((x) => x.name === p.name && x.group === p.group);
    if (idx >= 0) m.projects[idx] = p;
    else m.projects.push(p);
    await this.save(m);
  }

  async removeProject(name: string, group: string): Promise<void> {
    const m = await this.load();
    m.projects = m.projects.filter((p) => !(p.name === name && p.group === group));
    await this.save(m);
  }

  async list(filter?: { group?: string; tag?: string }): Promise<Project[]> {
    const m = await this.load();
    return m.projects.filter((p) => {
      if (filter?.group && p.group !== filter.group) return false;
      if (filter?.tag && !(p.tags ?? []).includes(filter.tag)) return false;
      return true;
    });
  }

  resolvePath(p: Project): string {
    if (!this.cache) throw new ManifestError('Manifest not loaded', 'E_MANIFEST_NOT_LOADED');
    return path.join(expandHome(this.cache.root), p.group, p.name);
  }

  invalidate(): void {
    this.cache = null;
  }
}
