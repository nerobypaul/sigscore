import type { HttpClient } from '../client.js';
import type {
  RecomputeResult,
  ScorePreview,
  ScoringConfig,
} from '../types.js';

/**
 * Configure scoring rules, tier thresholds, and recompute account scores.
 */
export class ScoringResource {
  constructor(private readonly client: HttpClient) {}

  /**
   * Get the current scoring configuration (rules + tier thresholds).
   */
  async getConfig(): Promise<ScoringConfig> {
    return this.client.get<ScoringConfig>('/api/v1/scoring/config');
  }

  /**
   * Replace the entire scoring configuration.
   */
  async updateConfig(config: ScoringConfig): Promise<ScoringConfig> {
    return this.client.put<ScoringConfig>('/api/v1/scoring/config', config);
  }

  /**
   * Preview how a proposed scoring configuration would affect account scores
   * without persisting the changes.
   */
  async preview(config: ScoringConfig): Promise<ScorePreview[]> {
    const data = await this.client.post<{ previews: ScorePreview[] }>(
      '/api/v1/scoring/preview',
      config,
    );
    return data.previews;
  }

  /**
   * Force-recompute all account scores using the current configuration.
   * Optionally pass a config to save-and-recompute in one call.
   */
  async recompute(config?: ScoringConfig): Promise<RecomputeResult> {
    return this.client.post<RecomputeResult>(
      '/api/v1/scoring/recompute',
      config,
    );
  }

  /**
   * Reset scoring configuration to platform defaults and recompute.
   */
  async reset(): Promise<ScoringConfig> {
    return this.client.post<ScoringConfig>('/api/v1/scoring/reset');
  }
}
