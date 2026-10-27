import type { PluginHandlerContext } from "@getpaseo/plugin/server";

type PaseoApi = PluginHandlerContext["paseo"];

import type { Source } from "./context.js";
import { readRecentContext, sourceKey } from "./context.js";
import { generateSuggestion, type SuggestionGenerator } from "./generate.js";

interface Job {
  key: string;
  controller: AbortController;
  consumers: Set<string>;
  promise: Promise<string | null>;
}

export interface ResolveRequest {
  agentId: string;
  source: Source;
  requestId: string;
}

export function createSuggestionService(
  paseo: PaseoApi,
  generate: SuggestionGenerator = generateSuggestion,
  readContext = readRecentContext,
) {
  const jobs = new Map<string, Job>();
  const requests = new Map<string, Job>();
  const cache = new Map<string, { key: string; suggestion: string | null }>();
  const canceledBeforeResolve = new Set<string>();
  let disposed = false;

  function cancelAgent(agentId: string) {
    const job = jobs.get(agentId);
    if (job) {
      job.controller.abort();
      jobs.delete(agentId);
    }
    cache.delete(agentId);
  }

  function cancel(requestId: string): boolean {
    const job = requests.get(requestId);
    if (!job) {
      canceledBeforeResolve.add(requestId);
      if (canceledBeforeResolve.size > 100) {
        const oldest = canceledBeforeResolve.values().next().value;
        if (oldest !== undefined) canceledBeforeResolve.delete(oldest);
      }
      return false;
    }
    requests.delete(requestId);
    job.consumers.delete(requestId);
    if (job.consumers.size === 0) job.controller.abort();
    return true;
  }

  async function resolve({ agentId, source, requestId }: ResolveRequest) {
    if (disposed || canceledBeforeResolve.delete(requestId)) return { source, suggestion: null };
    const key = sourceKey(source);
    const cached = cache.get(agentId);
    if (cached?.key === key) {
      if (await readContext(paseo, agentId, source))
        return { source, suggestion: cached.suggestion };
      cache.delete(agentId);
    }

    let job = jobs.get(agentId);
    if (job && (job.key !== key || job.controller.signal.aborted)) {
      job.controller.abort();
      jobs.delete(agentId);
      job = undefined;
    }
    if (!job) {
      job = {
        key,
        controller: new AbortController(),
        consumers: new Set(),
        promise: Promise.resolve(null),
      };
      const current = job;
      jobs.set(agentId, current);
      current.promise = (async () => {
        try {
          const messages = await readContext(paseo, agentId, source);
          if (!messages || current.controller.signal.aborted) return null;
          const suggestion = await generate(messages, current.controller.signal);
          if (current.controller.signal.aborted) return null;
          if (!(await readContext(paseo, agentId, source))) return null;
          if (jobs.get(agentId) === current) {
            cache.set(agentId, { key, suggestion });
            if (cache.size > 100) {
              const oldest = cache.keys().next().value;
              if (oldest !== undefined) cache.delete(oldest);
            }
          }
          return suggestion;
        } catch (error) {
          if (current.controller.signal.aborted) return null;
          throw error;
        } finally {
          if (jobs.get(agentId) === current) jobs.delete(agentId);
          for (const consumer of current.consumers) requests.delete(consumer);
        }
      })();
    }

    job.consumers.add(requestId);
    requests.set(requestId, job);
    const suggestion = await job.promise;
    return { source, suggestion: disposed || !job.consumers.has(requestId) ? null : suggestion };
  }

  function dispose() {
    disposed = true;
    for (const job of jobs.values()) job.controller.abort();
    jobs.clear();
    requests.clear();
    cache.clear();
    canceledBeforeResolve.clear();
  }

  return { resolve, cancel, cancelAgent, dispose };
}
