# Vibe-Research Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `Vibe-Research` 完整落地到 `/Users/leo/Documents/投研体系`，先按上游默认方式跑通前后端，再为后续“投研体系”定制保留最小、本地化的改造边界。

**Architecture:** 当前目录直接作为上游项目的衍生根目录，第一阶段保持上游结构不动，只做完整落地、依赖安装、启动验证和最小本地化记录。实施顺序为：拉取源码、验证目录、安装后端、安装前端、运行验收、记录本地差异。

**Tech Stack:** Git, Python 3.10+, FastAPI, Uvicorn, React 19, Vite, TypeScript, npm

## Global Constraints

- 当前工作目录必须是 `/Users/leo/Documents/投研体系`
- 第一阶段禁止重构前后端架构
- 第一阶段禁止提前删除页面或模块
- 第一阶段禁止替换上游数据抓取底层
- 第一阶段按上游默认端口运行：后端 `8900`，前端 `5899`
- 第一阶段以“完整落地上游项目、先原样跑通、再逐步改造”为验收原则
- 当前目录尚未初始化为 git 仓库；若后续需要提交，必须先初始化仓库或在用户指定仓库中执行

---

### Task 1: 落地上游源码到当前目录

**Files:**
- Create: `/Users/leo/Documents/投研体系/.gitignore`
- Create: `/Users/leo/Documents/投研体系/README.md`
- Create: `/Users/leo/Documents/投研体系/backend/`
- Create: `/Users/leo/Documents/投研体系/frontend/`
- Create: `/Users/leo/Documents/投研体系/a-stock-data/`
- Create: `/Users/leo/Documents/投研体系/global-stock-data/`

**Interfaces:**
- Consumes: GitHub 仓库 `https://github.com/simonlin1212/Vibe-Research.git`
- Produces: 本地完整源码树，可供后续依赖安装和启动验证使用

- [ ] **Step 1: 写一个失败测试，确认当前目录尚未落地上游结构**

```python
from pathlib import Path

def test_repo_structure_missing_before_clone():
    root = Path("/Users/leo/Documents/投研体系")
    assert not (root / "backend").exists()
    assert not (root / "frontend").exists()
```

- [ ] **Step 2: 运行测试并确认它通过“缺失验证”**

Run: `python3 - <<'PY'\nfrom pathlib import Path\nroot = Path('/Users/leo/Documents/投研体系')\nassert not (root / 'backend').exists()\nassert not (root / 'frontend').exists()\nprint('PASS: upstream structure not present yet')\nPY`

Expected: PASS with `PASS: upstream structure not present yet`

- [ ] **Step 3: 用最小步骤把上游仓库完整拉到当前目录**

```bash
tmpdir="$(mktemp -d)"
git clone --depth 1 https://github.com/simonlin1212/Vibe-Research.git "$tmpdir/repo"
find /Users/leo/Documents/投研体系 -mindepth 1 -maxdepth 1 \
  ! -name docs \
  -exec rm -rf {} +
cp -R "$tmpdir/repo"/. /Users/leo/Documents/投研体系/
rm -rf /Users/leo/Documents/投研体系/.git
rm -rf "$tmpdir"
```

- [ ] **Step 4: 运行结构验证，确认关键目录已存在**

Run: `python3 - <<'PY'\nfrom pathlib import Path\nroot = Path('/Users/leo/Documents/投研体系')\nfor name in ['backend', 'frontend', 'a-stock-data', 'global-stock-data', 'README.md']:\n    assert (root / name).exists(), f'missing {name}'\nprint('PASS: upstream structure present')\nPY`

Expected: PASS with `PASS: upstream structure present`

- [ ] **Step 5: 提交当前阶段成果**

```bash
git init
git add .
git commit -m "chore: import vibe-research base project"
```

### Task 2: 验证并安装后端依赖

**Files:**
- Read: `/Users/leo/Documents/投研体系/backend/requirements.txt`
- Create: `/Users/leo/Documents/投研体系/backend/.venv/`
- Test: `/Users/leo/Documents/投研体系/backend/app.py`

**Interfaces:**
- Consumes: `backend/requirements.txt`, Python 3.10+
- Produces: 可运行的后端虚拟环境和依赖集合

- [ ] **Step 1: 写一个失败测试，确认后端虚拟环境尚未可用**

```python
from pathlib import Path

def test_backend_venv_missing_before_install():
    assert not Path("/Users/leo/Documents/投研体系/backend/.venv/bin/python").exists()
```

- [ ] **Step 2: 运行测试并确认它通过“未安装验证”**

Run: `python3 - <<'PY'\nfrom pathlib import Path\nassert not Path('/Users/leo/Documents/投研体系/backend/.venv/bin/python').exists()\nprint('PASS: backend venv missing before install')\nPY`

Expected: PASS with `PASS: backend venv missing before install`

- [ ] **Step 3: 创建虚拟环境并安装后端依赖**

```bash
cd /Users/leo/Documents/投研体系/backend
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
```

- [ ] **Step 4: 运行最小导入验证，确认后端依赖可用**

Run: `cd /Users/leo/Documents/投研体系/backend && .venv/bin/python - <<'PY'\nimport app\nprint('PASS: backend app importable')\nPY`

Expected: PASS with `PASS: backend app importable`

- [ ] **Step 5: 提交当前阶段成果**

```bash
git add /Users/leo/Documents/投研体系/.gitignore
git commit -m "chore: install backend dependencies"
```

### Task 3: 验证并安装前端依赖

**Files:**
- Read: `/Users/leo/Documents/投研体系/frontend/package.json`
- Create: `/Users/leo/Documents/投研体系/frontend/node_modules/`
- Test: `/Users/leo/Documents/投研体系/frontend/`

**Interfaces:**
- Consumes: `frontend/package.json`, npm
- Produces: 可运行的前端依赖树

- [ ] **Step 1: 写一个失败测试，确认前端依赖尚未安装**

```python
from pathlib import Path

def test_frontend_node_modules_missing_before_install():
    assert not Path("/Users/leo/Documents/投研体系/frontend/node_modules").exists()
```

- [ ] **Step 2: 运行测试并确认它通过“未安装验证”**

Run: `python3 - <<'PY'\nfrom pathlib import Path\nassert not Path('/Users/leo/Documents/投研体系/frontend/node_modules').exists()\nprint('PASS: frontend deps missing before install')\nPY`

Expected: PASS with `PASS: frontend deps missing before install`

- [ ] **Step 3: 安装前端依赖**

```bash
cd /Users/leo/Documents/投研体系/frontend
npm install
```

- [ ] **Step 4: 运行前端构建级验证**

Run: `cd /Users/leo/Documents/投研体系/frontend && npm run build`

Expected: PASS with Vite production build completed successfully

- [ ] **Step 5: 提交当前阶段成果**

```bash
git add /Users/leo/Documents/投研体系/frontend/package.json
git add /Users/leo/Documents/投研体系/frontend/package-lock.json
git commit -m "chore: install frontend dependencies"
```

### Task 4: 启动并验收后端服务

**Files:**
- Read: `/Users/leo/Documents/投研体系/backend/app.py`
- Test: `/Users/leo/Documents/投研体系/backend/`

**Interfaces:**
- Consumes: `backend/.venv`, `backend/app.py`
- Produces: 本地可访问的 FastAPI 服务 `http://127.0.0.1:8900`

- [ ] **Step 1: 写一个失败测试，确认后端端口当前未被服务占用**

```python
import socket

def test_backend_port_closed_before_start():
    sock = socket.socket()
    assert sock.connect_ex(("127.0.0.1", 8900)) != 0
```

- [ ] **Step 2: 运行测试并确认它通过“未启动验证”**

Run: `python3 - <<'PY'\nimport socket\nsock = socket.socket()\nassert sock.connect_ex(('127.0.0.1', 8900)) != 0\nprint('PASS: backend port closed before start')\nPY`

Expected: PASS with `PASS: backend port closed before start`

- [ ] **Step 3: 启动后端服务**

```bash
cd /Users/leo/Documents/投研体系/backend
nohup .venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8900 >/tmp/vibe-research-backend.log 2>&1 &
```

- [ ] **Step 4: 验证后端健康可达**

Run: `python3 - <<'PY'\nfrom urllib.request import urlopen\nresp = urlopen('http://127.0.0.1:8900/docs')\nassert resp.status == 200\nprint('PASS: backend reachable on 8900')\nPY`

Expected: PASS with `PASS: backend reachable on 8900`

- [ ] **Step 5: 提交当前阶段成果**

```bash
git add /Users/leo/Documents/投研体系/docs/superpowers/plans/2026-07-14-vibe-research-adoption.md
git commit -m "test: verify backend startup"
```

### Task 5: 启动并验收前端服务

**Files:**
- Read: `/Users/leo/Documents/投研体系/frontend/package.json`
- Test: `/Users/leo/Documents/投研体系/frontend/`

**Interfaces:**
- Consumes: `frontend/node_modules`, Vite dev server
- Produces: 本地可访问的前端服务 `http://127.0.0.1:5899`

- [ ] **Step 1: 写一个失败测试，确认前端端口当前未被服务占用**

```python
import socket

def test_frontend_port_closed_before_start():
    sock = socket.socket()
    assert sock.connect_ex(("127.0.0.1", 5899)) != 0
```

- [ ] **Step 2: 运行测试并确认它通过“未启动验证”**

Run: `python3 - <<'PY'\nimport socket\nsock = socket.socket()\nassert sock.connect_ex(('127.0.0.1', 5899)) != 0\nprint('PASS: frontend port closed before start')\nPY`

Expected: PASS with `PASS: frontend port closed before start`

- [ ] **Step 3: 启动前端服务**

```bash
cd /Users/leo/Documents/投研体系/frontend
nohup npm run dev -- --host 127.0.0.1 --port 5899 >/tmp/vibe-research-frontend.log 2>&1 &
```

- [ ] **Step 4: 验证前端首页可达**

Run: `python3 - <<'PY'\nfrom urllib.request import urlopen\nhtml = urlopen('http://127.0.0.1:5899').read().decode('utf-8', 'ignore')\nassert 'Vibe' in html or 'root' in html\nprint('PASS: frontend reachable on 5899')\nPY`

Expected: PASS with `PASS: frontend reachable on 5899`

- [ ] **Step 5: 提交当前阶段成果**

```bash
git add /Users/leo/Documents/投研体系/docs/superpowers/plans/2026-07-14-vibe-research-adoption.md
git commit -m "test: verify frontend startup"
```

### Task 6: 记录第一阶段本地化边界

**Files:**
- Create: `/Users/leo/Documents/投研体系/docs/local-adoption-notes.md`
- Modify: `/Users/leo/Documents/投研体系/docs/superpowers/specs/2026-07-14-vibe-research-adoption-design.md`
- Test: `/Users/leo/Documents/投研体系/docs/local-adoption-notes.md`

**Interfaces:**
- Consumes: 第一阶段运行结果、上游默认配置
- Produces: 第二阶段可直接使用的本地化清单

- [ ] **Step 1: 写一个失败测试，确认本地化记录文件尚不存在**

```python
from pathlib import Path

def test_local_notes_missing_before_creation():
    assert not Path("/Users/leo/Documents/投研体系/docs/local-adoption-notes.md").exists()
```

- [ ] **Step 2: 运行测试并确认它通过“文件缺失验证”**

Run: `python3 - <<'PY'\nfrom pathlib import Path\nassert not Path('/Users/leo/Documents/投研体系/docs/local-adoption-notes.md').exists()\nprint('PASS: local adoption notes missing before creation')\nPY`

Expected: PASS with `PASS: local adoption notes missing before creation`

- [ ] **Step 3: 创建本地化记录文件，明确第二阶段优先修改项**

```markdown
# Local Adoption Notes

## Stage 1 Status

- Upstream Vibe-Research imported into `/Users/leo/Documents/投研体系`
- Backend validated on `127.0.0.1:8900`
- Frontend validated on `127.0.0.1:5899`

## Stage 2 Priority

- Rename product copy from `Vibe-Research` to `投研体系`
- Centralize AI provider and model settings
- Review local data storage paths
- Move high-frequency entry points closer to 自选 / 持仓 / 个股研究 / 复盘 / 研究沉淀

## Keep Unchanged For Now

- Upstream data-source adapters
- Major frontend architecture
- Major backend architecture
- Large-scale module deletion
```

- [ ] **Step 4: 验证记录文件内容已生成**

Run: `python3 - <<'PY'\nfrom pathlib import Path\ntext = Path('/Users/leo/Documents/投研体系/docs/local-adoption-notes.md').read_text()\nassert 'Stage 2 Priority' in text\nassert '投研体系' in text\nprint('PASS: local adoption notes created')\nPY`

Expected: PASS with `PASS: local adoption notes created`

- [ ] **Step 5: 提交当前阶段成果**

```bash
git add /Users/leo/Documents/投研体系/docs/local-adoption-notes.md
git add /Users/leo/Documents/投研体系/docs/superpowers/specs/2026-07-14-vibe-research-adoption-design.md
git commit -m "docs: capture local adoption notes"
```
