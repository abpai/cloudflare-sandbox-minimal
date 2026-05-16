import { getSandbox } from '@cloudflare/sandbox';
import { bridge } from '@cloudflare/sandbox/bridge';

export { Sandbox } from '@cloudflare/sandbox';
export { WarmPool } from '@cloudflare/sandbox/bridge';

const SANDBOX_BASE_IMAGE = 'docker.io/cloudflare/sandbox:0.8.11';
const SANDBOX_PACKAGE_VERSION = '0.8.11';
const CAPABILITY_SANDBOX_ID = 'garagecapabilitiesv3';

type SandboxLike = ReturnType<typeof getSandbox>;

export default bridge({
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Get or create a sandbox instance
    const sandbox = getSandbox(env.Sandbox, 'my-sandbox');

    if (url.pathname === '/capabilities' || url.pathname === '/health/runtime') {
      const authFailure = requireBearer(request, env);
      if (authFailure) return authFailure;

      const capabilitySandbox = getSandbox(env.Sandbox, CAPABILITY_SANDBOX_ID);
      return capabilityResponse(capabilitySandbox);
    }

    // Execute a shell command
    if (url.pathname === '/run') {
      const result = await sandbox.exec('echo "2 + 2 = $((2 + 2))"');
      return Response.json({
        output: result.stdout,
        error: result.stderr,
        exitCode: result.exitCode,
        success: result.success
      });
    }

    // Work with files
    if (url.pathname === '/file') {
      await sandbox.writeFile('/workspace/hello.txt', 'Hello, Sandbox!');
      const file = await sandbox.readFile('/workspace/hello.txt');
      return Response.json({
        content: file.content
      });
    }

    return new Response('Try /run or /file');
  }
});

function requireBearer(request: Request, env: Env): Response | null {
  const token = (env as Env & { SANDBOX_API_KEY?: string }).SANDBOX_API_KEY;
  if (!token) return null;

  const authorization = request.headers.get('authorization') ?? '';
  const provided = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7)
    : '';
  if (provided === token) return null;

  return Response.json(
    { ok: false, error: 'Unauthorized', code: 'unauthorized' },
    { status: 401 }
  );
}

async function capabilityResponse(sandbox: SandboxLike): Promise<Response> {
  const tools = {
    node: await probe(sandbox, 'node --version'),
    bun: await probe(sandbox, 'bun --version'),
    go: await probe(sandbox, 'go version'),
    python: await probe(sandbox, 'python --version'),
    uv: await probe(sandbox, 'uv --version'),
    agentBrowser: await probe(sandbox, 'agent-browser --version'),
    browserDemo: await probe(sandbox, browserDemoProbeCommand(), 120_000),
  };
  const ok = Object.values(tools).every((tool) => tool.ok);
  const supported = Object.entries(tools)
    .filter(([, result]) => result.ok)
    .map(([name]) => name);

  return Response.json(
    {
      ok,
      image: {
        base: SANDBOX_BASE_IMAGE,
        sandboxPackageVersion: SANDBOX_PACKAGE_VERSION,
      },
      supported,
      tools,
    },
    { status: ok ? 200 : 503 }
  );
}

async function probe(
  sandbox: SandboxLike,
  command: string,
  timeout = 30_000
): Promise<{ ok: boolean; exitCode: number | null; stdout: string; stderr: string }> {
  try {
    const result = await sandbox.exec(command, { timeout });
    return {
      ok: result.success,
      exitCode: result.exitCode,
      stdout: trimOutput(result.stdout),
      stderr: trimOutput(result.stderr),
    };
  } catch (error) {
    return {
      ok: false,
      exitCode: null,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
    };
  }
}

function browserDemoProbeCommand(): string {
  return `timeout 110s bash -lc ${shellArg(BROWSER_DEMO_PROBE_SCRIPT)}`;
}

const BROWSER_DEMO_PROBE_SCRIPT = String.raw`
set -euo pipefail

workdir="$(mktemp -d)"
cat > "__DOLLAR__{workdir}/index.html" <<'HTML'
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Garage capability probe</title>
  </head>
  <body>
    <main>
      <h1>Garage capability probe</h1>
      <p id="status">ready</p>
      <button data-testid="demo-ready" onclick="document.getElementById('status').textContent='clicked'">Demo ready</button>
    </main>
  </body>
</html>
HTML

python -m http.server 18080 --directory "__DOLLAR__{workdir}" >"__DOLLAR__{workdir}/server.log" 2>&1 &
server_pid="$!"
cleanup() {
  agent-browser --session garage-capability record stop >/dev/null 2>&1 || true
  kill "__DOLLAR__{server_pid}" >/dev/null 2>&1 || true
  agent-browser --session garage-capability close >/dev/null 2>&1 || true
  rm -rf "__DOLLAR__{workdir}"
}
trap cleanup EXIT

for _ in $(seq 1 100); do
  if curl -fsS http://127.0.0.1:18080 >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

curl -fsS http://127.0.0.1:18080 >/dev/null
agent-browser --session garage-capability open http://127.0.0.1:18080
agent-browser --session garage-capability wait --text "Garage capability probe"
agent-browser --session garage-capability record start "__DOLLAR__{workdir}/demo.webm"
agent-browser --session garage-capability find testid demo-ready click
agent-browser --session garage-capability wait --text "clicked"
agent-browser --session garage-capability record stop
test -s "__DOLLAR__{workdir}/demo.webm"
printf 'demo_video_bytes=%s\n' "$(wc -c < "__DOLLAR__{workdir}/demo.webm")"
`.replaceAll('__DOLLAR__', '$');

function shellArg(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function trimOutput(value: string): string {
  return value.length > 4_000 ? `${value.slice(0, 4_000)}\n[truncated]` : value;
}
