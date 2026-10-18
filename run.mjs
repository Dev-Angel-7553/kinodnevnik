#!/usr/bin/env node
// Запуск «КиноДневника» одной командой: сервер FastAPI (порт 8000) + клиент Vite (порт 5173).
//   node run.mjs           — при первом запуске сам установит зависимости, затем запустит оба сервиса
//   node run.mjs --setup   — только установить зависимости
//   node run.mjs --test    — запустить автотесты сервера
//   node run.mjs --reset-db — пересоздать базу данных с демонстрационными данными
// Остановка — Ctrl+C (останавливаются оба процесса).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const BACKEND = join(ROOT, 'backend');
const FRONTEND = join(ROOT, 'frontend');
const WIN = process.platform === 'win32';
const VENV_PY = WIN ? join(BACKEND, '.venv', 'Scripts', 'python.exe') : join(BACKEND, '.venv', 'bin', 'python');
const NPM = WIN ? 'npm.cmd' : 'npm';

const color = (code, text) => (process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text);
const say = text => console.log(color('1;36', `› ${text}`));

function run(cmd, args, cwd) {
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: WIN });
  if (res.status !== 0) {
    console.error(color('31', `Команда завершилась с ошибкой: ${cmd} ${args.join(' ')}`));
    process.exit(res.status ?? 1);
  }
}

function findSystemPython() {
  for (const cmd of WIN ? ['py', 'python', 'python3'] : ['python3', 'python']) {
    const res = spawnSync(cmd, ['--version'], { shell: WIN, encoding: 'utf8' });
    if (res.status === 0) return cmd;
  }
  console.error(color('31', 'Не найден Python 3.11+. Установите его с python.org и запустите снова.'));
  process.exit(1);
}

function setup() {
  if (!existsSync(VENV_PY)) {
    say('Создаю виртуальное окружение Python (backend/.venv)…');
    run(findSystemPython(), ['-m', 'venv', '.venv'], BACKEND);
    say('Устанавливаю зависимости сервера…');
    run(VENV_PY, ['-m', 'pip', 'install', '--upgrade', 'pip', '-q'], BACKEND);
    run(VENV_PY, ['-m', 'pip', 'install', '-r', 'requirements.txt'], BACKEND);
  }
  if (!existsSync(join(FRONTEND, 'node_modules'))) {
    say('Устанавливаю зависимости клиента (npm install)…');
    run(NPM, ['install', '--no-fund', '--no-audit'], FRONTEND);
  }
}

function start(name, code, cmd, args, cwd) {
  const child = spawn(cmd, args, { cwd, shell: WIN, env: { ...process.env, PYTHONUNBUFFERED: '1', FORCE_COLOR: '1' } });
  const prefix = color(code, `[${name}]`);
  const pipe = stream => {
    let rest = '';
    stream.on('data', chunk => {
      const lines = (rest + chunk.toString()).split(/\r?\n/);
      rest = lines.pop();
      lines.forEach(line => console.log(`${prefix} ${line}`));
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);
  child.on('exit', (code, signal) => {
    console.log(`${prefix} процесс завершён${signal ? '' : ` (код ${code})`}`);
    shutdown();
  });
  return child;
}

const children = [];
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  children.forEach(child => {
    if (child.exitCode !== null) return;
    if (WIN) spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f']);
    else child.kill('SIGINT');
  });
  setTimeout(() => process.exit(0), 500);
}

setup();
if (process.argv.includes('--setup')) {
  say('Готово. Запуск: node run.mjs');
  process.exit(0);
}
if (process.argv.includes('--test')) {
  run(VENV_PY, ['-m', 'pytest', '-v'], BACKEND);
  process.exit(0);
}
if (process.argv.includes('--reset-db')) {
  run(VENV_PY, ['-m', 'app.seed', '--reset'], BACKEND);
  process.exit(0);
}

say('Запускаю сервер (FastAPI) и клиент (Vite)…');
children.push(start('api', '35', VENV_PY, ['-m', 'uvicorn', 'app.main:app', '--reload', '--port', '8000'], BACKEND));
children.push(start('web', '32', NPM, ['run', 'dev'], FRONTEND));
say('Приложение: http://localhost:5173   ·   API и документация: http://localhost:8000/docs');
say('С телефона в той же Wi-Fi сети: адрес «Network» из строк [web]. Остановка — Ctrl+C');

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
