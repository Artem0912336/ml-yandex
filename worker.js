
let mode = null, runFn = null;
const HARNESS = null;
async function init(prefer, harnessFromPage) {
  const errors = [];
  if (prefer !== 'skulpt') {
    try {
      importScripts("https://cdn.jsdelivr.net/npm/pyodide@0.26.4/full/pyodide.js");
      const py = await loadPyodide({ indexURL: "https://cdn.jsdelivr.net/npm/pyodide@0.26.4/full/" });
      py.runPython(HARNESS || harnessFromPage);
      runFn = py.globals.get('__ml90_run');
      mode = 'pyodide';
      return { mode, version: 'CPython ' + py.runPython('import sys; sys.version.split()[0]') + ' (Pyodide ' + py.version + ')' };
    } catch (e) { errors.push('Pyodide: ' + ((e && e.message) || e)); }
  }
  try {
    importScripts("https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt.min.js", "https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt-stdlib.js");
    mode = 'skulpt';
    return { mode, version: 'Skulpt 1.2 (упрощённый Python 3)', errors };
  } catch (e) { errors.push('Skulpt: ' + ((e && e.message) || e)); }
  throw new Error(errors.join(' | '));
}
function runSkulpt(code, stdin) {
  let out = '';
  const lines = stdin.split('\n'); let i = 0;
  Sk.configure({
    output: (s) => { out += s; },
    read: (x) => { if (Sk.builtinFiles === undefined || Sk.builtinFiles.files[x] === undefined) throw "File not found: '" + x + "'"; return Sk.builtinFiles.files[x]; },
    inputfun: () => { if (i >= lines.length || (i === lines.length - 1 && lines[i] === '' && i > 0)) throw new Sk.builtin.EOFError('EOF when reading a line'); return lines[i++]; },
    inputfunTakesPrompt: true, __future__: Sk.python3, execLimit: null,
  });
  return Sk.misceval.asyncToPromise(() => Sk.importMainWithBody('<solution>', false, code, true)).then(() => ({ out, err: null }), (e) => {
    let name = 'Error', msg = String(e), line = null;
    try {
      if (e.tp$name) name = e.tp$name;
      if (e.args && e.args.v && e.args.v.length) { const a = e.args.v[0]; msg = String(a.v !== undefined ? a.v : a); }
      if (e.traceback && e.traceback.length) line = e.traceback[0].lineno;
    } catch (_) {}
    return { out, err: { name, msg, line, trace: String(e) } };
  });
}
self.onmessage = async (ev) => {
  const m = ev.data;
  if (m.type === 'init') {
    try { const info = await init(m.prefer, m.harness); postMessage({ type: 'ready', info }); }
    catch (e) { postMessage({ type: 'fail', error: String((e && e.message) || e) }); }
    return;
  }
  if (m.type === 'run') {
    const t0 = Date.now();
    try {
      let res;
      if (mode === 'pyodide') res = JSON.parse(runFn(m.code, m.stdin));
      else res = await runSkulpt(m.code, m.stdin);
      res.ms = Date.now() - t0;
      postMessage({ type: 'result', id: m.id, res });
    } catch (e) {
      postMessage({ type: 'result', id: m.id, res: { out: '', err: { name: 'InternalError', msg: String((e && e.message) || e), line: null, trace: '' }, ms: Date.now() - t0 } });
    }
  }
};