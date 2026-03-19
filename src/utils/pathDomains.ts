export interface PathDomainStat {
  domain: string;
  count: number;
  ratio: number;
}

export interface PathDomainSummary {
  domains: PathDomainStat[];
  dominantDomain?: string;
  concentration: number;
  total: number;
}

const MONOREPO_ROOTS = new Set(['packages', 'apps', 'services']);
const NOISY_ROOTS = new Set([
  'src',
  'lib',
  'test',
  'tests',
  'spec',
  'specs',
  'docs',
  'doc',
  'build',
  'dist',
  'scripts',
  'script',
  'config',
  'configs',
  'assets',
  'public',
  'static',
  'internal',
  'tools',
  'tool'
]);

export function extractPathDomainSummary(files: string[]): PathDomainSummary {
  const counts: Record<string, number> = {};
  let total = 0;

  files.forEach(file => {
    const domain = extractDomainFromPath(file);
    if (!domain) return;
    counts[domain] = (counts[domain] || 0) + 1;
    total += 1;
  });

  const domains = Object.entries(counts)
    .map(([domain, count]) => ({
      domain,
      count,
      ratio: total > 0 ? count / total : 0
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.domain.localeCompare(b.domain);
    });

  const dominantDomain = domains[0]?.domain;
  const concentration = domains[0]?.ratio ?? 0;

  return {
    domains,
    dominantDomain,
    concentration,
    total
  };
}

function extractDomainFromPath(path: string): string | null {
  const cleaned = normalizePath(path);
  if (!cleaned) return null;
  const segments = cleaned.split('/').filter(Boolean);
  if (segments.length <= 1) return null;

  const first = segments[0].toLowerCase();
  const second = segments[1]?.toLowerCase();
  const third = segments[2]?.toLowerCase();

  if (MONOREPO_ROOTS.has(first) && second) {
    return `${first}/${second}`;
  }

  if (NOISY_ROOTS.has(first)) {
    if (!second) return first;
    if (MONOREPO_ROOTS.has(second) && third) {
      return `${second}/${third}`;
    }
    return second;
  }

  return first;
}

function normalizePath(path: string) {
  return path
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .trim();
}
