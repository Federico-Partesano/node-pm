import fs from 'node:fs/promises';
import path from 'node:path';
import { Entry } from '@napi-rs/keyring';
import { Octokit } from 'octokit';
import { ManifestSchema, type Manifest } from '../shared/types.js';
import { SyncError } from '../shared/errors.js';

const SERVICE = 'node-pm';
const ACCOUNT = 'github-token';

export class GistSync {
  private _entry: Entry | null = null;
  private getEntry(): Entry {
    if (!this._entry) this._entry = new Entry(SERVICE, ACCOUNT);
    return this._entry;
  }

  async getToken(): Promise<string | null> {
    try {
      return this.getEntry().getPassword();
    } catch {
      return null;
    }
  }

  async setToken(token: string): Promise<void> {
    this.getEntry().setPassword(token);
  }

  async push(manifest: Manifest, fallbackPath?: string): Promise<{ gistId: string; url: string }> {
    const token = await this.getToken();
    if (!token) throw new SyncError('No GitHub token. Run `pm config set token <tok>`.', 'E_SYNC_NO_TOKEN');
    const okto = new Octokit({ auth: token });
    const { sync: _sync, ...scrubbed } = manifest;
    const content = JSON.stringify(scrubbed, null, 2);
    try {
      if (manifest.sync?.gistId) {
        const res = await okto.rest.gists.update({
          gist_id: manifest.sync.gistId,
          files: { 'projects.json': { content } },
        });
        return { gistId: res.data.id!, url: res.data.html_url! };
      }
      const res = await okto.rest.gists.create({
        public: false,
        description: 'node-pm manifest',
        files: { 'projects.json': { content } },
      });
      return { gistId: res.data.id!, url: res.data.html_url! };
    } catch (err) {
      if (fallbackPath) {
        await fs.mkdir(path.dirname(fallbackPath), { recursive: true });
        await fs.writeFile(fallbackPath, content);
      }
      throw new SyncError(`Gist push failed: ${(err as Error).message}`, 'E_SYNC_PUSH', err as Error);
    }
  }

  async pull(gistId: string): Promise<Manifest> {
    const token = await this.getToken();
    if (!token) throw new SyncError('No GitHub token.', 'E_SYNC_NO_TOKEN');
    const okto = new Octokit({ auth: token });
    try {
      const res = await okto.rest.gists.get({ gist_id: gistId });
      const file = res.data.files?.['projects.json'];
      if (!file?.content) throw new SyncError('Gist has no projects.json', 'E_SYNC_EMPTY');
      const parsed = JSON.parse(file.content);
      return ManifestSchema.parse(parsed);
    } catch (err) {
      if (err instanceof SyncError) throw err;
      throw new SyncError(`Gist pull failed: ${(err as Error).message}`, 'E_SYNC_PULL', err as Error);
    }
  }
}
